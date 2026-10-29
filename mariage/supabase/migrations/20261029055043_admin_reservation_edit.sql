begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- L'historique ne duplique ni coordonnées, ni tokens, ni informations alimentaires.
create table public.lodging_admin_edit_history (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid references public.lodging_reservations(id) on delete set null,
  previous_amount_cents integer not null,
  new_amount_cents integer not null,
  registration_updated boolean not null,
  placement_updated boolean not null,
  created_at timestamptz not null default now()
);
create index lodging_admin_edit_history_reservation_idx on public.lodging_admin_edit_history(reservation_id, created_at desc);
alter table public.lodging_admin_edit_history enable row level security;
revoke all on public.lodging_admin_edit_history from public, anon, authenticated;
revoke all on public.lodging_admin_edit_history from service_role;
grant select, insert on public.lodging_admin_edit_history to service_role;

create function public.admin_reservation_snapshot(p_id uuid)
returns jsonb language sql stable security invoker set search_path=public
as $$
  select jsonb_build_object(
    'reservation', (select to_jsonb(s) from (select id,reference,booker_name,phone,email,guest_names,guests_count,nights,
      amount_cents,received_amount_cents,roommate_wishes,payment_method,payment_status,booking_status,placement_status,
      wedding_response_id,financial_review_status,previous_amount_cents,proposed_amount_cents,created_at,updated_at
      from public.lodging_reservations where id=p_id) s),
    'registration', (select to_jsonb(w) from (select id,respondent_name,respondent_email,companions,attendance_days,
      not_attending,departure_city,departure_country,latitude,longitude,friday_sleepers,saturday_sleepers,roommate_wishes,
      songs,phone,lodging_guest_names,lodging_nights,lodging_payment_method,dietary_requirements,lodging_reservation_id,
      created_at,updated_at from public.wedding_responses
      where id=r.wedding_response_id or lodging_reservation_id=r.id) w),
    'assignments', coalesce((select jsonb_agg(to_jsonb(a) order by a.guest_index) from public.lodging_guest_assignments a where a.reservation_id=p_id),'[]'::jsonb),
    'legacy', coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'updated_at',a.updated_at) order by a.id) from public.lodging_assignments a where a.reservation_id=p_id),'[]'::jsonb)
  ) from public.lodging_reservations r where r.id=p_id;
$$;

create function public.admin_update_reservation(
  p_id uuid, p_expected_reservation_updated_at timestamptz, p_expected_response_updated_at timestamptz,
  p_expected_assignments jsonb, p_expected_legacy jsonb, p_reservation jsonb, p_response jsonb,
  p_assignments jsonb, p_placement_changed boolean
)
returns jsonb language plpgsql security invoker set search_path=public
as $$
declare
  r public.lodging_reservations;
  w public.wedding_responses;
  next_r public.lodging_reservations;
  next_w public.wedding_responses;
  current_assignments jsonb;
  current_legacy jsonb;
  room text;
  night date;
  capacity integer;
  occupied integer;
  own_occupants integer;
  next_placement text;
  next_payment text;
  stamp timestamptz := clock_timestamp();
begin
  if p_expected_reservation_updated_at is null or jsonb_typeof(p_reservation) is distinct from 'object'
    or jsonb_typeof(p_assignments) is distinct from 'array' or p_placement_changed is null then
    raise exception 'INVALID_EDIT';
  end if;

  -- Même verrou de capacité que create_lodging_reservation ; ordre des chambres
  -- avant la réservation, comme place_lodging_guest, pour éviter une inversion.
  perform pg_advisory_xact_lock(20270529);
  for room in select distinct room_name from public.lodging_guest_assignments where reservation_id=p_id order by room_name loop
    perform pg_advisory_xact_lock(hashtext(room));
  end loop;
  select * into r from public.lodging_reservations where id=p_id for update;
  if r.id is null then raise exception 'RESERVATION_NOT_FOUND'; end if;
  if r.updated_at is distinct from p_expected_reservation_updated_at then raise exception 'EDIT_CONFLICT'; end if;
  if r.financial_review_status='pending' or exists(select 1 from public.lodging_change_requests where reservation_id=p_id and status='pending') then
    raise exception 'REVIEW_PENDING';
  end if;
  select * into w from public.wedding_responses where id=r.wedding_response_id or lodging_reservation_id=p_id for update;
  if w.id is not null and (p_response is null or w.updated_at is distinct from p_expected_response_updated_at)
    or w.id is null and (p_response is not null or p_expected_response_updated_at is not null) then raise exception 'EDIT_CONFLICT'; end if;
  perform 1 from public.lodging_guest_assignments where reservation_id=p_id for update;
  perform 1 from public.lodging_assignments where reservation_id=p_id for update;
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'updated_at',a.updated_at) order by a.guest_index),'[]'::jsonb)
    into current_assignments from public.lodging_guest_assignments a where a.reservation_id=p_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'updated_at',a.updated_at) order by a.id),'[]'::jsonb)
    into current_legacy from public.lodging_assignments a where a.reservation_id=p_id;
  if current_assignments is distinct from p_expected_assignments or current_legacy is distinct from p_expected_legacy then raise exception 'EDIT_CONFLICT'; end if;

  next_r := jsonb_populate_record(null::public.lodging_reservations,p_reservation);
  if next_r.booking_status not in ('active','cancelled') or next_r.booking_status is null
    or next_r.guests_count is null or next_r.guests_count not between 1 and 20
    or cardinality(next_r.guest_names) is distinct from next_r.guests_count
    or exists(select 1 from unnest(next_r.guest_names) g where g is null or length(btrim(g)) not between 1 and 80)
    or cardinality(next_r.nights) not between 1 and 2 or next_r.nights is null
    or not next_r.nights <@ array[date '2027-05-28',date '2027-05-29']
    or cardinality(next_r.nights) <> (select count(distinct n) from unnest(next_r.nights) n)
    or next_r.booking_status='active' and next_r.amount_cents is distinct from next_r.guests_count*cardinality(next_r.nights)*3500 then
    raise exception 'INVALID_EDIT';
  end if;
  if next_r.booking_status='active' then
    foreach night in array next_r.nights loop
      select coalesce(sum(guests_count),0) into occupied from public.lodging_reservations
        where id<>p_id and booking_status='active' and night=any(nights);
      if occupied+next_r.guests_count>106 then raise exception 'NIGHT_FULL'; end if;
    end loop;
  end if;

  if p_placement_changed then
    if next_r.booking_status='active' and jsonb_array_length(current_legacy)>0 then raise exception 'LEGACY_PLACEMENT'; end if;
    if exists(select 1 from jsonb_to_recordset(p_assignments) as a(guest_index integer,guest_name text,room_name text,assigned_nights date[])
      where a.guest_index is null or a.guest_index not between 1 and next_r.guests_count
        or a.guest_name is distinct from next_r.guest_names[a.guest_index]
        or cardinality(a.assigned_nights)<1 or a.assigned_nights is null or not a.assigned_nights <@ next_r.nights)
      or (select count(*)<>count(distinct a.guest_index) from jsonb_to_recordset(p_assignments) as a(guest_index integer)) then
      raise exception 'INVALID_PLACEMENT';
    end if;
    for room in select distinct a.room_name from jsonb_to_recordset(p_assignments) as a(room_name text) order by a.room_name loop
      capacity := public.lodging_room_capacity(room);
      if capacity is null or capacity=0 then raise exception 'INVALID_PLACEMENT'; end if;
      foreach night in array next_r.nights loop
        -- Les contrôles du plan existant réservent conservativement toutes les nuits.
        select count(*) into occupied from public.lodging_guest_assignments a
          join public.lodging_reservations other on other.id=a.reservation_id
          where a.room_name=room and other.id<>p_id and other.booking_status='active' and night=any(other.nights);
        select count(*) into own_occupants from jsonb_to_recordset(p_assignments) as a(room_name text) where a.room_name=room;
        if occupied+own_occupants>capacity then raise exception 'ROOM_FULL'; end if;
      end loop;
    end loop;
    delete from public.lodging_guest_assignments where reservation_id=p_id;
    delete from public.lodging_assignments where reservation_id=p_id;
    if next_r.booking_status='active' then
      insert into public.lodging_guest_assignments(reservation_id,guest_index,guest_name,room_name,assigned_nights,updated_at)
        select p_id,a.guest_index,a.guest_name,a.room_name,a.assigned_nights,stamp
        from jsonb_to_recordset(p_assignments) as a(guest_index smallint,guest_name text,room_name text,assigned_nights date[]);
    end if;
    next_placement := case when next_r.booking_status='cancelled' or jsonb_array_length(p_assignments)=0 then 'pending'
      when r.placement_status='finalized' and jsonb_array_length(p_assignments)=next_r.guests_count
        and not exists(select 1 from jsonb_to_recordset(p_assignments) as a(assigned_nights date[]) where not a.assigned_nights @> next_r.nights) then 'finalized'
      else 'in_progress' end;
  else next_placement := r.placement_status; end if;

  next_payment := case when r.received_amount_cents>=next_r.amount_cents then 'confirmed'
    when r.received_amount_cents>0 then 'unpaid'
    when r.payment_status='declared' then 'declared' else 'unpaid' end;
  update public.lodging_reservations set booker_name=next_r.booker_name, phone=next_r.phone, email=next_r.email,
    guest_names=next_r.guest_names, guests_count=next_r.guests_count, nights=next_r.nights, amount_cents=next_r.amount_cents,
    roommate_wishes=next_r.roommate_wishes, payment_method=next_r.payment_method, payment_status=next_payment,
    booking_status=next_r.booking_status, placement_status=next_placement, updated_at=stamp where id=p_id;
  -- received_amount_cents, id, référence, tokens et created_at ne sont jamais modifiés.
  if w.id is not null then
    next_w := jsonb_populate_record(null::public.wedding_responses,p_response);
    update public.wedding_responses set respondent_name=next_w.respondent_name, respondent_email=next_w.respondent_email,
      companions=next_w.companions, attendance_days=next_w.attendance_days, not_attending=next_w.not_attending,
      departure_city=next_w.departure_city, departure_country=next_w.departure_country, latitude=next_w.latitude, longitude=next_w.longitude,
      friday_sleepers=next_w.friday_sleepers, saturday_sleepers=next_w.saturday_sleepers, roommate_wishes=next_w.roommate_wishes,
      songs=next_w.songs, phone=next_w.phone, lodging_guest_names=next_w.lodging_guest_names, lodging_nights=next_w.lodging_nights,
      lodging_payment_method=next_w.lodging_payment_method, dietary_requirements=next_w.dietary_requirements, updated_at=stamp where id=w.id;
  end if;
  insert into public.lodging_admin_edit_history(reservation_id,previous_amount_cents,new_amount_cents,registration_updated,placement_updated)
    values(p_id,r.amount_cents,next_r.amount_cents,w.id is not null,p_placement_changed);
  return jsonb_build_object('updated_at',stamp);
end;
$$;

revoke all on function public.admin_reservation_snapshot(uuid) from public,anon,authenticated;
revoke all on function public.admin_update_reservation(uuid,timestamptz,timestamptz,jsonb,jsonb,jsonb,jsonb,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.admin_reservation_snapshot(uuid) to service_role;
grant execute on function public.admin_update_reservation(uuid,timestamptz,timestamptz,jsonb,jsonb,jsonb,jsonb,jsonb,boolean) to service_role;
notify pgrst,'reload schema';
commit;
