create extension if not exists pgcrypto;

create table if not exists public.carpool_offers (
  id uuid primary key default gen_random_uuid(),
  driver_name text not null check (char_length(driver_name) between 2 and 80),
  direction text not null check (direction in ('to_massacan', 'from_massacan')),
  other_place text not null check (char_length(other_place) between 2 and 140),
  departure_at timestamptz not null,
  seats_available smallint not null check (seats_available between 1 and 8),
  contact text not null check (char_length(contact) between 3 and 120),
  details text check (details is null or char_length(details) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists carpool_offers_departure_at_idx
  on public.carpool_offers (departure_at);

create table if not exists public.carpool_requests (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.carpool_offers(id) on delete cascade,
  passenger_name text not null check (char_length(passenger_name) between 2 and 80),
  passenger_contact text not null check (char_length(passenger_contact) between 3 and 120),
  seats_requested smallint not null check (seats_requested between 1 and 8),
  message text check (message is null or char_length(message) <= 300),
  created_at timestamptz not null default now()
);

create index if not exists carpool_requests_offer_id_idx
  on public.carpool_requests (offer_id);

alter table public.carpool_offers enable row level security;
alter table public.carpool_requests enable row level security;

notify pgrst, 'reload schema';
