begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Journal minimal : aucune copie des réponses, coordonnées ou données alimentaires.
create table public.registration_admin_edit_history (
  id uuid primary key default gen_random_uuid(),
  wedding_response_id uuid references public.wedding_responses(id) on delete set null,
  lodging_created boolean not null,
  created_at timestamptz not null default now()
);
create index registration_admin_edit_history_response_idx on public.registration_admin_edit_history(wedding_response_id, created_at desc);
alter table public.registration_admin_edit_history enable row level security;
revoke all on public.registration_admin_edit_history from public,anon,authenticated,service_role;
grant select,insert on public.registration_admin_edit_history to service_role;

create function public.admin_registration_snapshot(p_id uuid)
returns jsonb language sql stable security invoker set search_path=public
as $$
  select jsonb_build_object(
    'registration', (select to_jsonb(s) from (select id,respondent_name,respondent_email,companions,attendance_days,
      not_attending,departure_city,departure_country,latitude,longitude,friday_sleepers,saturday_sleepers,roommate_wishes,
      songs,phone,lodging_guest_names,lodging_nights,lodging_payment_method,dietary_requirements,lodging_reservation_id,
      created_at,updated_at from public.wedding_responses where id=p_id) s),
    'reservationId', coalesce(w.lodging_reservation_id,(select id from public.lodging_reservations where wedding_response_id=p_id))
  ) from public.wedding_responses w where w.id=p_id;
$$;

create function public.admin_update_registration(p_id uuid,p_expected_updated_at timestamptz,p_response jsonb)
returns jsonb language plpgsql security invoker set search_path=public
as $$
declare
  w public.wedding_responses;
  next_w public.wedding_responses;
  r public.lodging_reservations;
  stamp timestamptz := clock_timestamp();
  guest_count integer;
  night_count integer;
begin
  if p_expected_updated_at is null or jsonb_typeof(p_response) is distinct from 'object' then raise exception 'INVALID_EDIT'; end if;
  -- Même ordre de verrouillage que les autres éditions admin et la création existante.
  perform pg_advisory_xact_lock(20270529);
  select * into w from public.wedding_responses where id=p_id for update;
  if w.id is null then raise exception 'REGISTRATION_NOT_FOUND'; end if;
  if w.updated_at is distinct from p_expected_updated_at or w.lodging_reservation_id is not null
    or exists(select 1 from public.lodging_reservations where wedding_response_id=p_id) then raise exception 'EDIT_CONFLICT'; end if;
  next_w := jsonb_populate_record(null::public.wedding_responses,p_response);
  guest_count := cardinality(next_w.lodging_guest_names);
  night_count := cardinality(next_w.lodging_nights);
  if guest_count is null or night_count is null or next_w.not_attending is null
    or guest_count not between 0 and 20 or night_count not between 0 and 2
    or (guest_count=0) is distinct from (night_count=0)
    or next_w.not_attending and guest_count>0
    or not next_w.lodging_nights <@ array[date '2027-05-28',date '2027-05-29']
    or night_count <> (select count(distinct n) from unnest(next_w.lodging_nights) n)
    or exists(select 1 from unnest(next_w.lodging_guest_names) g where g is null or length(btrim(g)) not between 1 and 80) then
    raise exception 'INVALID_EDIT';
  end if;
  if guest_count>0 then
    if next_w.lodging_payment_method not in ('wero','bank_transfer') or next_w.lodging_payment_method is null then raise exception 'INVALID_EDIT'; end if;
    -- Réutilise le tarif et le contrôle de capacité réels. La création et les deux
    -- liens appartiennent à la même transaction : aucun hébergement orphelin.
    select * into r from public.create_lodging_reservation(
      'NPBV-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),gen_random_uuid(),
      next_w.respondent_name,next_w.phone,next_w.respondent_email,next_w.lodging_guest_names,
      guest_count::smallint,next_w.lodging_nights,next_w.roommate_wishes,next_w.lodging_payment_method
    );
    if r.id is null then raise exception 'INVALID_EDIT'; end if;
    update public.lodging_reservations set wedding_response_id=p_id,updated_at=stamp where id=r.id;
  end if;
  update public.wedding_responses set respondent_name=next_w.respondent_name,respondent_email=next_w.respondent_email,
    companions=next_w.companions,attendance_days=next_w.attendance_days,not_attending=next_w.not_attending,
    departure_city=next_w.departure_city,departure_country=next_w.departure_country,latitude=next_w.latitude,longitude=next_w.longitude,
    friday_sleepers=next_w.friday_sleepers,saturday_sleepers=next_w.saturday_sleepers,roommate_wishes=next_w.roommate_wishes,
    songs=next_w.songs,phone=next_w.phone,lodging_guest_names=next_w.lodging_guest_names,lodging_nights=next_w.lodging_nights,
    lodging_payment_method=next_w.lodging_payment_method,dietary_requirements=next_w.dietary_requirements,
    lodging_reservation_id=r.id,updated_at=stamp where id=p_id;
  -- id, created_at et management_token_hash restent inchangés.
  insert into public.registration_admin_edit_history(wedding_response_id,lodging_created) values(p_id,r.id is not null);
  return jsonb_build_object('updated_at',stamp,'reservation_id',r.id,'amount_cents',coalesce(r.amount_cents,0));
end;
$$;

revoke all on function public.admin_registration_snapshot(uuid) from public,anon,authenticated;
revoke all on function public.admin_update_registration(uuid,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.admin_registration_snapshot(uuid) to service_role;
grant execute on function public.admin_update_registration(uuid,timestamptz,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
