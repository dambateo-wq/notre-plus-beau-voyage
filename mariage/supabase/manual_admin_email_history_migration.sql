-- À exécuter une seule fois dans Supabase > SQL Editor.
-- Migration additive pour l'historique des e-mails déclenchés manuellement
-- depuis l'espace admin. Aucun envoi automatique n'est créé.

create extension if not exists pgcrypto;

create table if not exists public.wedding_email_history (
  id uuid primary key default gen_random_uuid(),
  email_type text not null
    check (email_type in ('manual_payment_reminder', 'manual_guest_message')),
  campaign_id uuid,
  lodging_reservation_id uuid
    references public.lodging_reservations(id) on delete set null,
  wedding_response_id uuid
    references public.wedding_responses(id) on delete set null,
  recipient_email text not null,
  recipient_name text,
  subject text not null,
  content text not null,
  status text not null
    check (status in ('sent', 'failed')),
  error_message text,
  created_at timestamptz not null default now()
);

alter table public.wedding_email_history enable row level security;

create index if not exists wedding_email_history_reservation_idx
  on public.wedding_email_history
  (lodging_reservation_id, email_type, created_at desc);

create index if not exists wedding_email_history_campaign_idx
  on public.wedding_email_history
  (campaign_id, created_at desc)
  where campaign_id is not null;

create index if not exists wedding_email_history_created_idx
  on public.wedding_email_history (created_at desc);

notify pgrst, 'reload schema';
