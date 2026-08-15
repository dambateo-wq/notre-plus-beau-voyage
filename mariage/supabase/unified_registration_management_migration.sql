-- À exécuter une seule fois dans Supabase > SQL Editor avant le déploiement
-- de la version qui fusionne inscription et hébergement.
-- Migration additive : aucune donnée existante n'est supprimée.

create extension if not exists pgcrypto;

alter table public.wedding_responses
  add column if not exists management_token_hash text,
  add column if not exists phone text,
  add column if not exists lodging_guest_names text[] not null default '{}',
  add column if not exists lodging_nights date[] not null default '{}',
  add column if not exists lodging_payment_method text not null default 'later',
  add column if not exists lodging_reservation_id uuid,
  add column if not exists updated_at timestamptz not null default now();

alter table public.wedding_responses
  drop constraint if exists wedding_responses_lodging_payment_method_check;
alter table public.wedding_responses
  add constraint wedding_responses_lodging_payment_method_check
  check (lodging_payment_method in ('wero', 'bank_transfer', 'later'));

create unique index if not exists wedding_responses_management_token_hash_idx
  on public.wedding_responses (management_token_hash)
  where management_token_hash is not null;

alter table public.lodging_reservations
  add column if not exists wedding_response_id uuid,
  add column if not exists financial_review_status text not null default 'none',
  add column if not exists previous_amount_cents integer,
  add column if not exists proposed_amount_cents integer;

alter table public.lodging_reservations
  drop constraint if exists lodging_reservations_financial_review_status_check;
alter table public.lodging_reservations
  add constraint lodging_reservations_financial_review_status_check
  check (financial_review_status in ('none', 'pending'));

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'lodging_reservations_wedding_response_id_fkey'
  ) then
    alter table public.lodging_reservations
      add constraint lodging_reservations_wedding_response_id_fkey
      foreign key (wedding_response_id)
      references public.wedding_responses(id)
      on delete set null;
  end if;
end $$;

create unique index if not exists lodging_reservations_wedding_response_id_idx
  on public.lodging_reservations (wedding_response_id)
  where wedding_response_id is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'wedding_responses_lodging_reservation_id_fkey'
  ) then
    alter table public.wedding_responses
      add constraint wedding_responses_lodging_reservation_id_fkey
      foreign key (lodging_reservation_id)
      references public.lodging_reservations(id)
      on delete set null;
  end if;
end $$;

create table if not exists public.lodging_change_requests (
  id uuid primary key default gen_random_uuid(),
  wedding_response_id uuid not null
    references public.wedding_responses(id) on delete cascade,
  reservation_id uuid not null
    references public.lodging_reservations(id) on delete cascade,
  old_amount_cents integer not null check (old_amount_cents >= 0),
  new_amount_cents integer not null check (new_amount_cents >= 0),
  difference_cents integer not null,
  old_details jsonb not null,
  new_details jsonb not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'refused', 'superseded')),
  decision_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.lodging_change_requests enable row level security;

create index if not exists lodging_change_requests_reservation_idx
  on public.lodging_change_requests (reservation_id, created_at desc);
create index if not exists lodging_change_requests_status_idx
  on public.lodging_change_requests (status, created_at desc);

create table if not exists public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  notification_type text not null,
  message text not null,
  wedding_response_id uuid
    references public.wedding_responses(id) on delete cascade,
  lodging_change_request_id uuid
    references public.lodging_change_requests(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.admin_notifications enable row level security;

create index if not exists admin_notifications_unread_idx
  on public.admin_notifications (created_at desc)
  where read_at is null;

notify pgrst, 'reload schema';
