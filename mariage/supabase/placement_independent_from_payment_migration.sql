-- Le placement des chambres devient indépendant de la validation du paiement.
-- Aucune donnée existante n'est modifiée par cette migration.

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
  if reservation.id is null or reservation.booking_status <> 'active' then
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

revoke all on function public.place_lodging_guest(uuid,smallint,text) from public, anon, authenticated;
grant execute on function public.place_lodging_guest(uuid,smallint,text) to service_role;

notify pgrst, 'reload schema';
