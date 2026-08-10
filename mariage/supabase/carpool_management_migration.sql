-- Migration additive : gestion privée des annonces, heures locales Paris et places individuelles.
-- À exécuter une fois dans Supabase > SQL Editor sur la base utilisée par design-v2.

create extension if not exists pgcrypto;

alter table public.carpool_offers
  add column if not exists driver_email text,
  add column if not exists management_token uuid default gen_random_uuid(),
  add column if not exists seats_total smallint,
  add column if not exists departure_local timestamp without time zone;

-- Les anciennes dates ont été envoyées comme une horloge UTC. On récupère cette
-- horloge afin que 10:00 saisi reste bien 10:00 à Paris.
update public.carpool_offers
set departure_local = departure_at at time zone 'UTC'
where departure_local is null;

update public.carpool_offers
set management_token = gen_random_uuid()
where management_token is null;

update public.carpool_offers
set seats_total = seats_available
where seats_total is null;

alter table public.carpool_offers
  drop constraint if exists carpool_offers_seats_available_check;
alter table public.carpool_offers
  add constraint carpool_offers_seats_available_check
  check (seats_available between 0 and 8);
alter table public.carpool_offers
  drop constraint if exists carpool_offers_seats_total_check;
alter table public.carpool_offers
  add constraint carpool_offers_seats_total_check
  check (seats_total between 1 and 8);

alter table public.carpool_offers
  alter column management_token set not null,
  alter column seats_total set not null,
  alter column departure_local set not null;

-- Compatibilité avec l’application actuellement en production : ses anciens
-- INSERT ne connaissent pas encore les nouvelles colonnes.
create or replace function public.carpool_offer_legacy_defaults()
returns trigger language plpgsql set search_path = public as $$
begin
  new.management_token := coalesce(new.management_token, gen_random_uuid());
  new.seats_total := coalesce(new.seats_total, new.seats_available);
  new.departure_local := coalesce(new.departure_local, new.departure_at at time zone 'UTC');
  return new;
end;
$$;
drop trigger if exists carpool_offer_legacy_defaults_trigger on public.carpool_offers;
create trigger carpool_offer_legacy_defaults_trigger
before insert on public.carpool_offers
for each row execute function public.carpool_offer_legacy_defaults();

create unique index if not exists carpool_offers_management_token_idx
  on public.carpool_offers(management_token);
create index if not exists carpool_offers_driver_email_idx
  on public.carpool_offers(lower(driver_email));
create index if not exists carpool_offers_departure_local_idx
  on public.carpool_offers(departure_local);

alter table public.carpool_requests
  add column if not exists status text not null default 'reserved'
  check (status in ('reserved', 'validated', 'cancelled'));

create table if not exists public.carpool_seats (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.carpool_offers(id) on delete cascade,
  position smallint not null check (position between 1 and 8),
  status text not null default 'free' check (status in ('free', 'reserved', 'validated')),
  request_id uuid references public.carpool_requests(id) on delete set null,
  passenger_name text,
  passenger_contact text,
  passenger_message text,
  updated_at timestamptz not null default now(),
  unique (offer_id, position)
);

alter table public.carpool_seats enable row level security;
create index if not exists carpool_seats_offer_idx on public.carpool_seats(offer_id, position);

create or replace function public.create_carpool_seats_after_offer()
returns trigger language plpgsql set search_path = public as $$
begin
  insert into public.carpool_seats (offer_id, position)
  select new.id, generate_series(1, new.seats_total)
  on conflict (offer_id, position) do nothing;
  return new;
end;
$$;
drop trigger if exists create_carpool_seats_after_offer_trigger on public.carpool_offers;
create trigger create_carpool_seats_after_offer_trigger
after insert on public.carpool_offers
for each row execute function public.create_carpool_seats_after_offer();

insert into public.carpool_seats (offer_id, position)
select offer.id, seat.position
from public.carpool_offers offer
cross join lateral generate_series(1, offer.seats_total) as seat(position)
on conflict (offer_id, position) do nothing;

-- Réintègre les anciennes demandes, dans l'ordre, sans dépasser la capacité.
with expanded as (
  select
    request.id as request_id,
    request.offer_id,
    request.passenger_name,
    request.passenger_contact,
    request.message,
    row_number() over (
      partition by request.offer_id
      order by request.created_at, request.id, generated.position
    ) as seat_position
  from public.carpool_requests request
  cross join lateral generate_series(1, request.seats_requested) as generated(position)
  where request.status <> 'cancelled'
)
update public.carpool_seats seat
set
  status = case when request.status = 'validated' then 'validated' else 'reserved' end,
  request_id = expanded.request_id,
  passenger_name = expanded.passenger_name,
  passenger_contact = expanded.passenger_contact,
  passenger_message = expanded.message,
  updated_at = now()
from expanded
join public.carpool_requests request on request.id = expanded.request_id
where seat.offer_id = expanded.offer_id
  and seat.position = expanded.seat_position
  and seat.status = 'free';

update public.carpool_offers offer
set seats_available = (
  select count(*)::smallint
  from public.carpool_seats seat
  where seat.offer_id = offer.id and seat.status = 'free'
);

create or replace function public.create_carpool_offer(
  p_driver_name text,
  p_driver_email text,
  p_direction text,
  p_other_place text,
  p_departure_local timestamp without time zone,
  p_seats_total smallint,
  p_contact text,
  p_details text,
  p_management_token uuid
)
returns setof public.carpool_offers
language plpgsql security definer set search_path = public
as $$
declare new_id uuid;
begin
  if p_direction not in ('to_massacan', 'from_massacan') then raise exception 'INVALID_DIRECTION'; end if;
  if p_departure_local < timestamp '2027-05-25 00:00' or p_departure_local > timestamp '2027-06-02 23:59' then raise exception 'INVALID_DATE'; end if;
  if p_seats_total < 1 or p_seats_total > 8 then raise exception 'INVALID_SEATS'; end if;

  insert into public.carpool_offers (
    driver_name, driver_email, direction, other_place, departure_local,
    departure_at, seats_available, seats_total, contact, details, management_token
  ) values (
    p_driver_name, lower(p_driver_email), p_direction, p_other_place, p_departure_local,
    p_departure_local at time zone 'Europe/Paris', p_seats_total, p_seats_total,
    p_contact, nullif(p_details, ''), p_management_token
  ) returning id into new_id;

  insert into public.carpool_seats (offer_id, position)
  select new_id, generate_series(1, p_seats_total)
  on conflict (offer_id, position) do nothing;

  return query select * from public.carpool_offers where id = new_id;
end;
$$;

create or replace function public.reserve_carpool_seats(
  p_offer_id uuid,
  p_passenger_name text,
  p_passenger_contact text,
  p_seats_requested smallint,
  p_message text
)
returns table(driver_contact text, remaining_seats smallint)
language plpgsql security definer set search_path = public
as $$
declare
  selected_positions smallint[];
  new_request_id uuid;
  offer_contact text;
begin
  perform pg_advisory_xact_lock(hashtext(p_offer_id::text));
  select contact into offer_contact from public.carpool_offers where id = p_offer_id for update;
  if offer_contact is null then raise exception 'OFFER_NOT_FOUND'; end if;
  if p_seats_requested < 1 or p_seats_requested > 8 then raise exception 'INVALID_SEATS'; end if;

  select array_agg(position order by position) into selected_positions
  from (
    select position from public.carpool_seats
    where offer_id = p_offer_id and status = 'free'
    order by position
    limit p_seats_requested
    for update
  ) free_seats;

  if coalesce(cardinality(selected_positions), 0) <> p_seats_requested then
    raise exception 'NOT_ENOUGH_SEATS';
  end if;

  insert into public.carpool_requests (
    offer_id, passenger_name, passenger_contact, seats_requested, message
  ) values (
    p_offer_id, p_passenger_name, p_passenger_contact, p_seats_requested, nullif(p_message, '')
  ) returning id into new_request_id;

  update public.carpool_seats set
    status = 'reserved', request_id = new_request_id,
    passenger_name = p_passenger_name, passenger_contact = p_passenger_contact,
    passenger_message = nullif(p_message, ''), updated_at = now()
  where offer_id = p_offer_id and position = any(selected_positions);

  update public.carpool_offers offer
  set seats_available = (
    select count(*)::smallint from public.carpool_seats seat
    where seat.offer_id = offer.id and seat.status = 'free'
  ) where offer.id = p_offer_id;

  return query select offer_contact, offer.seats_available
  from public.carpool_offers offer where offer.id = p_offer_id;
end;
$$;

-- Synchronise également les demandes créées par l’ancienne application de
-- production pendant que design-v2 est en Preview.
create or replace function public.reserve_carpool_seats_after_request()
returns trigger language plpgsql set search_path = public as $$
declare selected_positions smallint[];
begin
  if new.status = 'cancelled' then return new; end if;
  perform pg_advisory_xact_lock(hashtext(new.offer_id::text));
  if exists (select 1 from public.carpool_seats where request_id = new.id) then return new; end if;
  select array_agg(position order by position) into selected_positions
  from (
    select position from public.carpool_seats
    where offer_id = new.offer_id and status = 'free'
    order by position limit new.seats_requested for update
  ) free_seats;
  if coalesce(cardinality(selected_positions), 0) <> new.seats_requested then raise exception 'NOT_ENOUGH_SEATS'; end if;
  update public.carpool_seats set
    status = 'reserved', request_id = new.id, passenger_name = new.passenger_name,
    passenger_contact = new.passenger_contact, passenger_message = new.message, updated_at = now()
  where offer_id = new.offer_id and position = any(selected_positions);
  update public.carpool_offers offer set seats_available = (
    select count(*)::smallint from public.carpool_seats seat
    where seat.offer_id = offer.id and seat.status = 'free'
  ) where offer.id = new.offer_id;
  return new;
end;
$$;
drop trigger if exists reserve_carpool_seats_after_request_trigger on public.carpool_requests;
create trigger reserve_carpool_seats_after_request_trigger
after insert on public.carpool_requests
for each row execute function public.reserve_carpool_seats_after_request();

create or replace function public.cycle_carpool_seat(
  p_management_token uuid,
  p_seat_id uuid
)
returns setof public.carpool_seats
language plpgsql security definer set search_path = public
as $$
declare current_seat public.carpool_seats; offer_token uuid; next_status text;
begin
  select seat.* into current_seat from public.carpool_seats seat where seat.id = p_seat_id for update;
  if current_seat.id is null then raise exception 'SEAT_NOT_FOUND'; end if;
  select management_token into offer_token from public.carpool_offers where id = current_seat.offer_id for update;
  if offer_token is distinct from p_management_token then raise exception 'UNAUTHORIZED'; end if;

  next_status := case current_seat.status when 'free' then 'reserved' when 'reserved' then 'validated' else 'free' end;
  update public.carpool_seats set
    status = next_status,
    passenger_name = case when next_status = 'free' then null when current_seat.status = 'free' then 'Réservation manuelle' else passenger_name end,
    passenger_contact = case when next_status = 'free' then null else passenger_contact end,
    passenger_message = case when next_status = 'free' then null else passenger_message end,
    request_id = case when next_status = 'free' then null else request_id end,
    updated_at = now()
  where id = p_seat_id;

  if current_seat.request_id is not null then
    update public.carpool_requests set status = case when next_status = 'validated' then 'validated' when next_status = 'free' then 'cancelled' else 'reserved' end
    where id = current_seat.request_id;
  end if;

  update public.carpool_offers offer set seats_available = (
    select count(*)::smallint from public.carpool_seats seat
    where seat.offer_id = offer.id and seat.status = 'free'
  ) where offer.id = current_seat.offer_id;

  return query select * from public.carpool_seats where id = p_seat_id;
end;
$$;

revoke all on function public.create_carpool_offer(text,text,text,text,timestamp without time zone,smallint,text,text,uuid) from public, anon, authenticated;
revoke all on function public.reserve_carpool_seats(uuid,text,text,smallint,text) from public, anon, authenticated;
revoke all on function public.cycle_carpool_seat(uuid,uuid) from public, anon, authenticated;
grant execute on function public.create_carpool_offer(text,text,text,text,timestamp without time zone,smallint,text,text,uuid) to service_role;
grant execute on function public.reserve_carpool_seats(uuid,text,text,smallint,text) to service_role;
grant execute on function public.cycle_carpool_seat(uuid,uuid) to service_role;

notify pgrst, 'reload schema';
