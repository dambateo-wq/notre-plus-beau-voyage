create extension if not exists pgcrypto;

create table if not exists public.lodging_reservations (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  access_token uuid not null unique,
  booker_name text not null check (char_length(booker_name) between 2 and 80),
  phone text not null check (char_length(phone) between 8 and 30),
  email text check (email is null or char_length(email) <= 120),
  guest_names text[] not null default '{}',
  guests_count smallint not null check (guests_count between 1 and 20),
  nights date[] not null,
  amount_cents integer not null check (amount_cents > 0),
  roommate_wishes text check (
    roommate_wishes is null or char_length(roommate_wishes) <= 500
  ),
  payment_method text not null check (
    payment_method in ('wero', 'bank_transfer', 'later')
  ),
  payment_status text not null default 'unpaid' check (
    payment_status in ('unpaid', 'declared', 'confirmed')
  ),
  booking_status text not null default 'active' check (
    booking_status in ('active', 'cancelled')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lodging_reservations_nights_idx
  on public.lodging_reservations using gin (nights);

create index if not exists lodging_reservations_status_idx
  on public.lodging_reservations (booking_status, payment_status);

alter table public.lodging_reservations enable row level security;

create or replace function public.create_lodging_reservation(
  p_reference text,
  p_access_token uuid,
  p_booker_name text,
  p_phone text,
  p_email text,
  p_guest_names text[],
  p_guests_count smallint,
  p_nights date[],
  p_roommate_wishes text,
  p_payment_method text
)
returns setof public.lodging_reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_night date;
  already_reserved integer;
  new_id uuid;
begin
  if p_guests_count < 1 or p_guests_count > 20 then
    raise exception 'INVALID_GUEST_COUNT';
  end if;

  if cardinality(p_nights) < 1 or cardinality(p_nights) > 2 then
    raise exception 'INVALID_NIGHTS';
  end if;

  if p_payment_method not in ('wero', 'bank_transfer', 'later') then
    raise exception 'INVALID_PAYMENT_METHOD';
  end if;

  perform pg_advisory_xact_lock(20270529);

  foreach requested_night in array p_nights loop
    if requested_night not in (date '2027-05-28', date '2027-05-29') then
      raise exception 'INVALID_NIGHT';
    end if;

    select coalesce(sum(guests_count), 0)
      into already_reserved
      from public.lodging_reservations
      where booking_status = 'active'
        and requested_night = any(nights);

    if already_reserved + p_guests_count > 90 then
      raise exception 'NIGHT_FULL_%', requested_night;
    end if;
  end loop;

  insert into public.lodging_reservations (
    reference,
    access_token,
    booker_name,
    phone,
    email,
    guest_names,
    guests_count,
    nights,
    amount_cents,
    roommate_wishes,
    payment_method
  )
  values (
    p_reference,
    p_access_token,
    p_booker_name,
    p_phone,
    nullif(p_email, ''),
    p_guest_names,
    p_guests_count,
    p_nights,
    p_guests_count * cardinality(p_nights) * 3500,
    nullif(p_roommate_wishes, ''),
    p_payment_method
  )
  returning id into new_id;

  return query
    select *
    from public.lodging_reservations
    where id = new_id;
end;
$$;

revoke all on function public.create_lodging_reservation(
  text, uuid, text, text, text, text[], smallint, date[], text, text
) from public, anon, authenticated;

grant execute on function public.create_lodging_reservation(
  text, uuid, text, text, text, text[], smallint, date[], text, text
) to service_role;

notify pgrst, 'reload schema';
