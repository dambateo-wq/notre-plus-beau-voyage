-- Migration additive : placement individuel des voyageurs dans les chambres.
-- La table historique lodging_assignments est conservée intacte.

create table if not exists public.lodging_guest_assignments (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.lodging_reservations(id) on delete cascade,
  guest_index smallint not null check (guest_index between 1 and 20),
  guest_name text not null,
  room_name text not null,
  updated_at timestamptz not null default now(),
  unique (reservation_id, guest_index)
);

alter table public.lodging_guest_assignments enable row level security;
create index if not exists lodging_guest_assignments_room_idx
  on public.lodging_guest_assignments(room_name);

-- Reprend les placements historiques : chaque personne du groupe conserve la chambre du groupe.
insert into public.lodging_guest_assignments (reservation_id, guest_index, guest_name, room_name)
select
  reservation.id,
  guest.position,
  coalesce(
    nullif(btrim(reservation.guest_names[guest.position]), ''),
    case when guest.position = 1 then reservation.booker_name else reservation.booker_name || ' · ' || guest.position end
  ),
  assignment.room_name
from public.lodging_assignments assignment
join public.lodging_reservations reservation on reservation.id = assignment.reservation_id
cross join lateral generate_series(1, reservation.guests_count) as guest(position)
on conflict (reservation_id, guest_index) do nothing;

create or replace function public.lodging_room_capacity(p_room_name text)
returns smallint language sql immutable as $$
  select case p_room_name
    when 'LAURIERS HAUT' then 6 when 'LAURIERS BAS' then 4 when 'LAURIERS TERRASSE' then 4
    when 'YUCCAS CHAMBRE' then 2 when 'YUCCAS STUDIO' then 2
    when 'A1' then 4 when 'A2' then 2 when 'A3' then 4 when 'A4' then 3
    when 'A5' then 4 when 'A6' then 2 when 'A7' then 3 when 'A8' then 2
    when 'A9' then 5 when 'A10' then 5 when 'A11' then 2 when 'A12' then 3
    when 'B1' then 4 when 'B2' then 3 when 'B3' then 3 when 'B4' then 3
    when 'B5' then 2 when 'B6' then 3 when 'B7' then 2 when 'B8' then 4
    when 'B9' then 2 when 'B10' then 4 when 'B11' then 2 when 'B12' then 4
    when 'B13' then 2 when 'B14' then 4 when 'B15' then 7
    else 0 end::smallint;
$$;

create or replace function public.place_lodging_guest(
  p_reservation_id uuid,
  p_guest_index smallint,
  p_room_name text
)
returns setof public.lodging_guest_assignments
language plpgsql security definer set search_path = public
as $$
declare
  reservation public.lodging_reservations;
  capacity smallint;
  requested_night date;
  occupied integer;
  resolved_name text;
begin
  perform pg_advisory_xact_lock(hashtext(p_room_name));
  select * into reservation from public.lodging_reservations where id = p_reservation_id for update;
  if reservation.id is null or reservation.booking_status <> 'active' or reservation.payment_status <> 'confirmed' then
    raise exception 'RESERVATION_NOT_PLACEABLE';
  end if;
  if p_guest_index < 1 or p_guest_index > reservation.guests_count then raise exception 'INVALID_GUEST'; end if;
  capacity := public.lodging_room_capacity(p_room_name);
  if capacity = 0 then raise exception 'INVALID_ROOM'; end if;

  foreach requested_night in array reservation.nights loop
    select count(*) into occupied
    from public.lodging_guest_assignments assignment
    join public.lodging_reservations other_reservation on other_reservation.id = assignment.reservation_id
    where assignment.room_name = p_room_name
      and other_reservation.booking_status = 'active'
      and requested_night = any(other_reservation.nights)
      and not (assignment.reservation_id = p_reservation_id and assignment.guest_index = p_guest_index);
    if occupied + 1 > capacity then raise exception 'ROOM_FULL_%', requested_night; end if;
  end loop;

  resolved_name := coalesce(
    nullif(btrim(reservation.guest_names[p_guest_index]), ''),
    case when p_guest_index = 1 then reservation.booker_name else reservation.booker_name || ' · ' || p_guest_index end
  );
  insert into public.lodging_guest_assignments (reservation_id, guest_index, guest_name, room_name, updated_at)
  values (p_reservation_id, p_guest_index, resolved_name, p_room_name, now())
  on conflict (reservation_id, guest_index) do update set
    guest_name = excluded.guest_name, room_name = excluded.room_name, updated_at = now();

  return query select * from public.lodging_guest_assignments
  where reservation_id = p_reservation_id and guest_index = p_guest_index;
end;
$$;

create or replace function public.unplace_lodging_guest(p_reservation_id uuid, p_guest_index smallint)
returns void language sql security definer set search_path = public as $$
  delete from public.lodging_guest_assignments
  where reservation_id = p_reservation_id and guest_index = p_guest_index;
$$;

revoke all on function public.place_lodging_guest(uuid,smallint,text) from public, anon, authenticated;
revoke all on function public.unplace_lodging_guest(uuid,smallint) from public, anon, authenticated;
grant execute on function public.place_lodging_guest(uuid,smallint,text) to service_role;
grant execute on function public.unplace_lodging_guest(uuid,smallint) to service_role;

notify pgrst, 'reload schema';
