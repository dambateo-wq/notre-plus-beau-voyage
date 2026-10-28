-- PROPOSITION À RELIRE : ne pas appliquer sans accord de Damien.
-- Les inscriptions, affectations et montants existants ne sont pas réécrits.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- NULL sur les réservations historiques signifie « encaissement non vérifié ».
-- Le défaut 0 ne s'applique qu'aux nouvelles réservations créées après migration.
alter table public.lodging_reservations add column if not exists received_amount_cents integer;
alter table public.lodging_reservations alter column received_amount_cents set default 0;
alter table public.lodging_reservations add constraint lodging_received_amount_nonnegative
  check (received_amount_cents is null or received_amount_cents >= 0);

-- NULL conserve le contrat historique : chambre attribuée pour toutes les nuits réservées.
alter table public.lodging_guest_assignments add column if not exists assigned_nights date[];
alter table public.lodging_guest_assignments add constraint lodging_assigned_nights_valid
  check (assigned_nights is null or assigned_nights <@ array[date '2027-05-28', date '2027-05-29']);

create table public.wedding_digest_runs (
  key text primary key,
  period_start timestamptz not null,
  period_end timestamptz not null,
  mode text not null check (mode in ('scheduled', 'test')),
  status text not null default 'preparing' check (status in ('preparing','ready','sent','blocked','uncertain')),
  attempts integer not null default 0,
  lease_token uuid,
  lease_until timestamptz,
  subject text,
  text_body text,
  html_body text,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_start < period_end)
);
create table public.wedding_digest_deliveries (
  run_key text not null references public.wedding_digest_runs(key) on delete cascade,
  recipient text not null check (recipient in ('damien','julie')),
  status text not null default 'pending' check (status in ('pending','sending','sent','failed','uncertain')),
  attempts integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  error_code text,
  primary key (run_key, recipient)
);
create table public.wedding_digest_events (
  id uuid primary key default gen_random_uuid(),
  run_key text not null references public.wedding_digest_runs(key) on delete cascade,
  event text not null,
  created_at timestamptz not null default now()
);
create index wedding_digest_events_run_idx on public.wedding_digest_events(run_key, created_at desc);
create index wedding_digest_runs_latest_idx on public.wedding_digest_runs(created_at desc);
create unique index wedding_digest_runs_one_scheduled_period on public.wedding_digest_runs(period_end) where mode='scheduled';

alter table public.wedding_digest_runs enable row level security;
alter table public.wedding_digest_deliveries enable row level security;
alter table public.wedding_digest_events enable row level security;
revoke all on public.wedding_digest_runs, public.wedding_digest_deliveries, public.wedding_digest_events from public, anon, authenticated;
grant select, insert, update on public.wedding_digest_runs, public.wedding_digest_deliveries to service_role;
grant select, insert on public.wedding_digest_events to service_role;

-- Un seul snapshot cohérent ; aucun e-mail, téléphone, token ou régime alimentaire lu.
create function public.weekly_digest_snapshot()
returns jsonb language sql stable security invoker set search_path = public
as $$
  select jsonb_build_object(
    'captured_at', statement_timestamp(),
    'registrations', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at, r.id) from (
      select id, respondent_name, companions, attendance_days, not_attending, created_at,
        lodging_guest_names, lodging_nights, roommate_wishes, lodging_reservation_id
      from public.wedding_responses
    ) r), '[]'::jsonb),
    'reservations', coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from (
      select id, reference, booker_name, guest_names, guests_count, nights, amount_cents,
        received_amount_cents, payment_method, payment_status, booking_status, roommate_wishes,
        wedding_response_id, financial_review_status, proposed_amount_cents
      from public.lodging_reservations
    ) r), '[]'::jsonb),
    'assignments', coalesce((select jsonb_agg(to_jsonb(a) order by a.reservation_id, a.guest_index) from (
      select reservation_id, guest_index, guest_name, room_name, assigned_nights from public.lodging_guest_assignments
    ) a), '[]'::jsonb),
    'legacy_assignments', coalesce((select jsonb_agg(to_jsonb(a) order by a.reservation_id) from (
      select reservation_id, room_name, friday_adults, friday_children, friday_babies,
        saturday_adults, saturday_children, saturday_babies from public.lodging_assignments
    ) a), '[]'::jsonb)
  );
$$;

-- Verrou de campagne et états persistants AVANT/APRÈS chaque tentative SMTP.
create function public.weekly_digest_journal(p_action text, p_key text, p_token uuid default null, p_data jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path = public
as $$
declare
  r public.wedding_digest_runs;
  d public.wedding_digest_deliveries;
  v_start timestamptz;
  v_end timestamptz;
  v_mode text;
  v_status text;
begin
  if p_action = 'claim' then
    v_start := (p_data->>'start')::timestamptz;
    v_end := (p_data->>'end')::timestamptz;
    v_mode := p_data->>'mode';
    if v_mode not in ('scheduled','test') or v_start is null or v_end is null
      or extract(dow from v_end at time zone 'Europe/Paris') <> 0
      or (v_end at time zone 'Europe/Paris')::time <> time '18:00'
      or v_start <> ((v_end at time zone 'Europe/Paris') - interval '7 days') at time zone 'Europe/Paris'
      or length(p_key) > 200 or p_key is null then raise exception 'invalid_digest_period'; end if;
    insert into public.wedding_digest_runs(key, period_start, period_end, mode)
    values (p_key,v_start,v_end,v_mode) on conflict(key) do nothing;
    select * into strict r from public.wedding_digest_runs where key = p_key for update;
    if r.period_start <> v_start or r.period_end <> v_end or r.mode <> v_mode then raise exception 'digest_key_conflict'; end if;
    if r.status in ('sent','uncertain') then return jsonb_build_object('acquired',false,'reason',r.status); end if;
    if r.lease_until > clock_timestamp() then return jsonb_build_object('acquired',false,'reason','busy'); end if;
    -- Une exécution interrompue après début SMTP ne peut pas être renvoyée aveuglément.
    if exists(select 1 from public.wedding_digest_deliveries where run_key=p_key and status='sending') then
      update public.wedding_digest_deliveries set status='uncertain', error_code='interrupted_smtp' where run_key=p_key and status='sending';
      update public.wedding_digest_runs set status='uncertain', lease_token=null, lease_until=null, error_code='interrupted_smtp', updated_at=now() where key=p_key;
      insert into public.wedding_digest_events(run_key,event) values(p_key,'uncertain');
      return jsonb_build_object('acquired',false,'reason','uncertain');
    end if;
    update public.wedding_digest_runs set lease_token=gen_random_uuid(), lease_until=clock_timestamp()+interval '3 minutes',
      attempts=attempts+1, status=case when html_body is null then 'preparing' else 'ready' end, error_code=null, updated_at=now()
      where key=p_key returning * into r;
    insert into public.wedding_digest_deliveries(run_key,recipient) values
      (p_key,'damien'),(p_key,'julie') on conflict do nothing;
    insert into public.wedding_digest_events(run_key,event) values(p_key,'claimed');
    return jsonb_build_object('acquired',true,'run',to_jsonb(r));
  end if;

  select * into strict r from public.wedding_digest_runs where key=p_key for update;
  if p_token is null or r.lease_token is distinct from p_token then raise exception 'digest_lease_lost'; end if;

  if p_action = 'prepare' then
    if r.lease_until < clock_timestamp() then raise exception 'digest_lease_expired'; end if;
    if r.html_body is null then
      if coalesce(length(p_data->>'html'),0)=0 or coalesce(length(p_data->>'text'),0)=0 or coalesce(length(p_data->>'subject'),0)=0 then raise exception 'empty_digest'; end if;
      update public.wedding_digest_runs set subject=p_data->>'subject', html_body=p_data->>'html', text_body=p_data->>'text', status='ready', updated_at=now()
        where key=p_key returning * into r;
    end if;
    return jsonb_build_object('run',to_jsonb(r));
  elsif p_action = 'begin_delivery' then
    if r.lease_until < clock_timestamp() or r.html_body is null then raise exception 'digest_not_ready'; end if;
    select * into strict d from public.wedding_digest_deliveries where run_key=p_key and recipient=p_data->>'recipient' for update;
    if d.status in ('sent','sending','uncertain') then return jsonb_build_object('send',false,'status',d.status); end if;
    update public.wedding_digest_deliveries set status='sending', attempts=attempts+1, started_at=clock_timestamp(), error_code=null
      where run_key=p_key and recipient=d.recipient;
    insert into public.wedding_digest_events(run_key,event) values(p_key,'smtp_started');
    return jsonb_build_object('send',true);
  elsif p_action = 'finish_delivery' then
    v_status := p_data->>'status';
    if v_status not in ('sent','failed','uncertain') then raise exception 'invalid_delivery_status'; end if;
    update public.wedding_digest_deliveries set status=v_status, completed_at=clock_timestamp(), error_code=p_data->>'error'
      where run_key=p_key and recipient=p_data->>'recipient' and status='sending';
    if not found then raise exception 'delivery_not_started'; end if;
    insert into public.wedding_digest_events(run_key,event) values(p_key,'smtp_'||v_status);
    return jsonb_build_object('ok',true);
  elsif p_action = 'release' then
    v_status := case
      when exists(select 1 from public.wedding_digest_deliveries where run_key=p_key and status in ('uncertain','sending')) then 'uncertain'
      when not exists(select 1 from public.wedding_digest_deliveries where run_key=p_key and status<>'sent') then 'sent'
      when p_data->>'error' is not null then 'blocked' else 'ready' end;
    update public.wedding_digest_runs set status=v_status, lease_token=null, lease_until=null, updated_at=now(), error_code=p_data->>'error' where key=p_key;
    insert into public.wedding_digest_events(run_key,event) values(p_key,v_status);
    return jsonb_build_object('status',v_status);
  end if;
  raise exception 'invalid_digest_action';
end;
$$;

revoke all on function public.weekly_digest_snapshot() from public, anon, authenticated;
revoke all on function public.weekly_digest_journal(text,text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.weekly_digest_snapshot() to service_role;
grant execute on function public.weekly_digest_journal(text,text,uuid,jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
