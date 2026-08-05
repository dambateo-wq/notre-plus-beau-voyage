-- À exécuter une fois dans Supabase > SQL Editor.
-- Le plan compte 106 couchages invités : PALMIER est réservé aux mariés,
-- et A9/A10 comportent 5 couchages chacun.

create table if not exists public.lodging_assignments (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null unique references public.lodging_reservations(id) on delete cascade,
  room_name text not null,
  friday_adults smallint not null default 0 check (friday_adults >= 0),
  friday_children smallint not null default 0 check (friday_children >= 0),
  friday_babies smallint not null default 0 check (friday_babies >= 0),
  saturday_adults smallint not null default 0 check (saturday_adults >= 0),
  saturday_children smallint not null default 0 check (saturday_children >= 0),
  saturday_babies smallint not null default 0 check (saturday_babies >= 0),
  updated_at timestamptz not null default now()
);

alter table public.lodging_assignments enable row level security;
create index if not exists lodging_assignments_room_idx on public.lodging_assignments(room_name);

create or replace function public.create_lodging_reservation(
  p_reference text, p_access_token uuid, p_booker_name text, p_phone text,
  p_email text, p_guest_names text[], p_guests_count smallint, p_nights date[],
  p_roommate_wishes text, p_payment_method text
)
returns setof public.lodging_reservations
language plpgsql security definer set search_path = public
as $$
declare requested_night date; already_reserved integer; new_id uuid;
begin
  if p_guests_count < 1 or p_guests_count > 20 then raise exception 'INVALID_GUEST_COUNT'; end if;
  if cardinality(p_nights) < 1 or cardinality(p_nights) > 2 then raise exception 'INVALID_NIGHTS'; end if;
  if p_payment_method not in ('wero', 'bank_transfer', 'later') then raise exception 'INVALID_PAYMENT_METHOD'; end if;
  perform pg_advisory_xact_lock(20270529);
  foreach requested_night in array p_nights loop
    if requested_night not in (date '2027-05-28', date '2027-05-29') then raise exception 'INVALID_NIGHT'; end if;
    select coalesce(sum(guests_count), 0) into already_reserved from public.lodging_reservations
      where booking_status = 'active' and requested_night = any(nights);
    if already_reserved + p_guests_count > 106 then raise exception 'NIGHT_FULL_%', requested_night; end if;
  end loop;
  insert into public.lodging_reservations (
    reference, access_token, booker_name, phone, email, guest_names, guests_count,
    nights, amount_cents, roommate_wishes, payment_method
  ) values (
    p_reference, p_access_token, p_booker_name, p_phone, nullif(p_email, ''),
    p_guest_names, p_guests_count, p_nights, p_guests_count * cardinality(p_nights) * 3500,
    nullif(p_roommate_wishes, ''), p_payment_method
  ) returning id into new_id;
  return query select * from public.lodging_reservations where id = new_id;
end;
$$;

notify pgrst, 'reload schema';
