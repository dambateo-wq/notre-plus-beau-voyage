-- Additive scheduler only. Never rewrites registrations, lodging, payments or beds.
-- Created inactive: provision Vault, verify the deployed route, then activate explicitly.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net;

do $$
begin
  if current_setting('cron.timezone', true) not in ('GMT', 'UTC', 'Etc/UTC')
    or current_setting('cron.timezone', true) is null then
    raise exception 'weekly_digest_requires_utc_cron';
  end if;
end;
$$;

create schema wedding_digest_scheduler;
revoke all on schema wedding_digest_scheduler from public, anon, authenticated, service_role;

-- No guest names, message bodies, headers or secrets in this transport journal.
create table wedding_digest_scheduler.dispatches (
  period_end timestamptz not null,
  attempt smallint not null check (attempt between 1 and 4),
  request_id bigint not null unique,
  queued_at timestamptz not null default clock_timestamp(),
  checked_at timestamptz,
  http_status integer,
  endpoint_status text,
  error_code text,
  primary key (period_end, attempt)
);
alter table wedding_digest_scheduler.dispatches enable row level security;
revoke all on wedding_digest_scheduler.dispatches from public, anon, authenticated, service_role;

-- Use the Paris calendar, never a fixed UTC offset. p_now is pure testable input.
create function wedding_digest_scheduler.due_period(p_now timestamptz)
returns timestamptz language sql immutable strict security invoker set search_path = ''
as $$
  select case
    when extract(isodow from p_now at time zone 'Europe/Paris') = 7
      and extract(hour from p_now at time zone 'Europe/Paris') = 18
      and extract(minute from p_now at time zone 'Europe/Paris') between 0 and 10
    then (date_trunc('day', p_now at time zone 'Europe/Paris') + interval '18 hours')
      at time zone 'Europe/Paris'
    else null
  end;
$$;

create function wedding_digest_scheduler.dispatch()
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_end timestamptz;
  v_run record;
  v_previous wedding_digest_scheduler.dispatches;
  v_response record;
  v_payload jsonb;
  v_endpoint text;
  v_error text;
  v_count integer;
  v_secret text;
  v_request_id bigint;
begin
  if not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended('notre-plus-beau-voyage:weekly-digest:supabase-cron', 0)
  ) then
    return jsonb_build_object('status', 'busy');
  end if;

  -- pg_net retains responses for only six hours. Persist only safe outcome codes.
  for v_response in
    select d.period_end, d.attempt, d.queued_at, r.id as response_id, r.status_code,
      r.timed_out, r.error_msg is not null as transport_error, r.content
    from wedding_digest_scheduler.dispatches d
    left join net._http_response r on r.id = d.request_id
    where d.checked_at is null
  loop
    if v_response.response_id is null
      and v_response.queued_at > v_now - interval '65 seconds' then
      continue;
    end if;
    v_payload := null;
    v_endpoint := null;
    v_error := null;
    if v_response.response_id is null then
      v_error := 'http_response_missing';
    elsif v_response.timed_out then
      v_error := 'http_timeout';
    elsif v_response.transport_error then
      v_error := 'http_transport_error';
    else
      begin
        v_payload := v_response.content::jsonb;
      exception when invalid_text_representation then
        v_payload := null;
      end;
      if v_payload->>'status' in ('sent', 'disabled', 'not_due', 'busy', 'ready', 'blocked', 'uncertain') then
        v_endpoint := v_payload->>'status';
      end if;
      if v_response.status_code = 489 then
        v_endpoint := 'uncertain';
      elsif v_response.status_code >= 400 then
        v_error := 'http_error';
      elsif v_endpoint is null then
        v_error := 'invalid_http_response';
      end if;
    end if;
    update wedding_digest_scheduler.dispatches
      set checked_at = v_now, http_status = v_response.status_code,
        endpoint_status = v_endpoint, error_code = v_error
      where period_end = v_response.period_end and attempt = v_response.attempt;
  end loop;

  v_end := wedding_digest_scheduler.due_period(v_now);
  if v_end is null then return jsonb_build_object('status', 'not_due'); end if;

  -- Reuse the existing durable campaign/delivery journal and its SMTP protections.
  select status, lease_until into v_run from public.wedding_digest_runs
    where mode = 'scheduled' and period_end = v_end;
  if v_run.status in ('sent', 'uncertain') then
    return jsonb_build_object('status', v_run.status, 'periodEnd', v_end);
  end if;
  if v_run.lease_until > v_now then
    return jsonb_build_object('status', 'busy', 'periodEnd', v_end);
  end if;

  select * into v_previous from wedding_digest_scheduler.dispatches
    where period_end = v_end order by attempt desc limit 1;
  if v_previous.endpoint_status in ('uncertain', 'disabled') then
    return jsonb_build_object('status', v_previous.endpoint_status, 'periodEnd', v_end);
  end if;
  if v_previous.checked_at is null and v_previous.request_id is not null then
    return jsonb_build_object('status', 'in_flight', 'periodEnd', v_end);
  end if;
  if v_previous.queued_at > v_now - interval '60 seconds' then
    return jsonb_build_object('status', 'retry_wait', 'periodEnd', v_end);
  end if;
  select count(*) into v_count from wedding_digest_scheduler.dispatches where period_end = v_end;
  if v_count >= 4 then
    return jsonb_build_object('status', 'retries_exhausted', 'periodEnd', v_end);
  end if;

  select decrypted_secret into v_secret from vault.decrypted_secrets
    where name = 'wedding_weekly_digest_cron_secret';
  if v_secret is null or length(v_secret) < 32 then
    raise exception 'weekly_digest_cron_secret_missing';
  end if;
  v_request_id := net.http_post(
    url := 'https://les-dadjus-notre-plus-beau-voyage.vercel.app/api/cron/weekly-digest',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 55000
  );
  insert into wedding_digest_scheduler.dispatches(period_end, attempt, request_id, queued_at)
    values(v_end, v_count + 1, v_request_id, v_now);
  return jsonb_build_object('status', 'queued', 'periodEnd', v_end, 'attempt', v_count + 1, 'requestId', v_request_id);
end;
$$;

revoke all on all functions in schema wedding_digest_scheduler from public, anon, authenticated, service_role;

-- UTC candidates cover winter and summer; the Paris guard permits just the right hour.
-- Minutes 11/12 only reconcile HTTP outcomes. At most four HTTP attempts per week.
do $$
declare v_job bigint;
begin
  if exists(select 1 from cron.job where jobname = 'notre-plus-beau-voyage-weekly-digest') then
    raise exception 'weekly_digest_schedule_already_exists';
  end if;
  v_job := cron.schedule('notre-plus-beau-voyage-weekly-digest', '0-12 16-17 * * 0',
    'select wedding_digest_scheduler.dispatch();');
  perform cron.alter_job(v_job, active := false);
end;
$$;
commit;
