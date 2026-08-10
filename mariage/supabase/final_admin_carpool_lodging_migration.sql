-- Corrections finales : redimensionnement des covoiturages et workflow de placement.
-- À exécuter une fois dans Supabase > SQL Editor, après les migrations
-- carpool_management_migration.sql et lodging_guest_assignments_migration.sql.

alter table public.lodging_reservations
  add column if not exists placement_status text default 'pending';

update public.lodging_reservations reservation
set placement_status = case
  when exists (
    select 1
    from public.lodging_guest_assignments assignment
    where assignment.reservation_id = reservation.id
  ) then 'in_progress'
  else 'pending'
end
where placement_status is null or placement_status = 'pending';

alter table public.lodging_reservations
  alter column placement_status set default 'pending',
  alter column placement_status set not null;

alter table public.lodging_reservations
  drop constraint if exists lodging_reservations_placement_status_check;
alter table public.lodging_reservations
  add constraint lodging_reservations_placement_status_check
  check (placement_status in ('pending', 'in_progress', 'finalized'));

create index if not exists lodging_reservations_placement_status_idx
  on public.lodging_reservations (placement_status, payment_status, booking_status);

create or replace function public.resize_carpool_offer_seats(
  p_offer_id uuid,
  p_seats_total smallint
)
returns table(seats_total smallint, seats_available smallint)
language plpgsql
security definer
set search_path = public
as $$
declare
  offer_row public.carpool_offers;
  occupied_seats public.carpool_seats[];
  occupied_seat public.carpool_seats;
  occupied_count integer;
  next_position smallint := 0;
begin
  if p_seats_total < 1 or p_seats_total > 8 then
    raise exception 'INVALID_SEATS';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_offer_id::text));
  select * into offer_row
  from public.carpool_offers
  where id = p_offer_id
  for update;

  if offer_row.id is null then
    raise exception 'OFFER_NOT_FOUND';
  end if;

  perform 1
  from public.carpool_seats
  where offer_id = p_offer_id
  for update;

  select coalesce(
    array_agg(seat order by seat.position),
    array[]::public.carpool_seats[]
  )
  into occupied_seats
  from public.carpool_seats seat
  where seat.offer_id = p_offer_id
    and seat.status <> 'free';

  occupied_count := coalesce(cardinality(occupied_seats), 0);
  if p_seats_total < occupied_count then
    raise exception 'TOO_FEW_SEATS';
  end if;

  -- Reconstruit les places dans l’ordre afin de toujours conserver des
  -- positions continues de 1 à 8, tout en gardant les passagers et leurs IDs.
  delete from public.carpool_seats where offer_id = p_offer_id;

  if occupied_count > 0 then
    foreach occupied_seat in array occupied_seats loop
      next_position := next_position + 1;
      insert into public.carpool_seats (
        id, offer_id, position, status, request_id,
        passenger_name, passenger_contact, passenger_message, updated_at
      ) values (
        occupied_seat.id, p_offer_id, next_position, occupied_seat.status,
        occupied_seat.request_id, occupied_seat.passenger_name,
        occupied_seat.passenger_contact, occupied_seat.passenger_message, now()
      );
    end loop;
  end if;

  insert into public.carpool_seats (offer_id, position)
  select p_offer_id, generated.position
  from generate_series(occupied_count + 1, p_seats_total) as generated(position);

  update public.carpool_offers
  set
    seats_total = p_seats_total,
    seats_available = (p_seats_total - occupied_count)::smallint
  where id = p_offer_id;

  return query
  select offer.seats_total, offer.seats_available
  from public.carpool_offers offer
  where offer.id = p_offer_id;
end;
$$;

revoke all on function public.resize_carpool_offer_seats(uuid, smallint)
  from public, anon, authenticated;
grant execute on function public.resize_carpool_offer_seats(uuid, smallint)
  to service_role;

notify pgrst, 'reload schema';
