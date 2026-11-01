begin;
set local lock_timeout = '5s';
set local statement_timeout = '20s';

-- Ne remplace pas silencieusement une fonction modifiée après l'audit du 01/11/2026.
-- Aucun placement, inscription, réservation ou encaissement n'est modifié ici.
do $$
begin
  if (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.place_lodging_guest(uuid,smallint,text)'))
    is distinct from '96552da551f3a6083384a993c8bef978' then
    raise exception 'PLACEMENT_SCHEMA_CHANGED_REVIEW_REQUIRED';
  end if;
end;
$$;

-- Même signature que la fonction existante, également utilisée pour rapprocher
-- les voyageurs après une modification d'inscription. Les contrôles propres à
-- l'interface admin restent dans la transaction dédiée ci-dessous, afin de ne
-- pas bloquer ce rapprochement interne pendant une validation financière.
create or replace function public.place_lodging_guest(
  p_reservation_id uuid,
  p_guest_index smallint,
  p_room_name text
)
returns setof public.lodging_guest_assignments
language plpgsql security invoker set search_path = public
as $$
declare
  reservation public.lodging_reservations;
  capacity smallint;
  requested_night date;
  occupied integer;
  resolved_name text;
begin
  perform pg_advisory_xact_lock(20270529);
  perform pg_advisory_xact_lock(hashtext(p_room_name));
  select * into reservation from public.lodging_reservations where id = p_reservation_id for update;
  if reservation.id is null or reservation.booking_status <> 'active' then
    raise exception 'RESERVATION_NOT_PLACEABLE';
  end if;
  if p_guest_index is null or p_guest_index < 1 or p_guest_index > reservation.guests_count then raise exception 'INVALID_GUEST'; end if;
  capacity := public.lodging_room_capacity(p_room_name);
  if capacity is null or capacity = 0 then raise exception 'INVALID_ROOM'; end if;

  foreach requested_night in array reservation.nights loop
    select count(*) into occupied
    from public.lodging_guest_assignments assignment
    join public.lodging_reservations other_reservation on other_reservation.id = assignment.reservation_id
    where assignment.room_name = p_room_name
      and other_reservation.booking_status = 'active'
      and requested_night = any(coalesce(assignment.assigned_nights, other_reservation.nights))
      and not (assignment.reservation_id = p_reservation_id and assignment.guest_index = p_guest_index);
    if occupied + 1 > capacity then raise exception 'ROOM_FULL_%', requested_night; end if;
  end loop;

  resolved_name := coalesce(
    nullif(btrim(reservation.guest_names[p_guest_index]), ''),
    case when p_guest_index = 1 then reservation.booker_name else reservation.booker_name || ' · ' || p_guest_index end
  );
  insert into public.lodging_guest_assignments (reservation_id, guest_index, guest_name, room_name, assigned_nights, updated_at)
  values (p_reservation_id, p_guest_index, resolved_name, p_room_name, reservation.nights, clock_timestamp())
  on conflict (reservation_id, guest_index) do update set
    guest_name = excluded.guest_name, room_name = excluded.room_name, assigned_nights = excluded.assigned_nights, updated_at = excluded.updated_at;

  return query select * from public.lodging_guest_assignments
  where reservation_id = p_reservation_id and guest_index = p_guest_index;
end;
$$;

revoke all on function public.place_lodging_guest(uuid,smallint,text) from public, anon, authenticated;
grant execute on function public.place_lodging_guest(uuid,smallint,text) to service_role;

-- Les quatre opérations admin vérifient leur état en base, sous les mêmes verrous.
-- Le statut de placement ne change qu'après la réussite de l'attribution/retrait.
create function public.admin_lodging_placement(
  p_operation text,p_reservation_id uuid,p_guest_index smallint default null,p_room_name text default null
)
returns jsonb language plpgsql security invoker set search_path=public
as $$
declare
  reservation public.lodging_reservations;
  assignment public.lodging_guest_assignments;
  room text;
  night date;
  capacity integer;
  occupied integer;
  next_status text;
begin
  if p_operation is null or p_operation not in ('place','remove','finalize','reopen') then raise exception 'INVALID_PLACEMENT_ACTION'; end if;
  perform pg_advisory_xact_lock(20270529);
  -- Même ordre que admin_update_reservation : capacité globale, chambres triées,
  -- réservation. Inclut la chambre quittée et celle demandée, sans vider le plan.
  for room in select distinct x.room_name from (
    select a.room_name from public.lodging_guest_assignments a where a.reservation_id=p_reservation_id
    union all select p_room_name where p_operation='place' and p_room_name is not null
  ) x order by x.room_name loop
    perform pg_advisory_xact_lock(hashtext(room));
  end loop;
  select * into reservation from public.lodging_reservations where id=p_reservation_id for update;
  if reservation.id is null or reservation.booking_status is distinct from 'active' then raise exception 'RESERVATION_NOT_PLACEABLE'; end if;
  if reservation.financial_review_status='pending' or exists(
    select 1 from public.lodging_change_requests where reservation_id=p_reservation_id and status='pending'
  ) then raise exception 'REVIEW_PENDING'; end if;
  if reservation.nights is null or cardinality(reservation.nights)<1
    or not reservation.nights <@ array[date '2027-05-28',date '2027-05-29'] then raise exception 'INVALID_NIGHTS'; end if;
  if p_operation in ('place','remove') and (p_guest_index is null or p_guest_index<1
    or p_guest_index>reservation.guests_count or nullif(btrim(reservation.guest_names[p_guest_index]),'') is null) then
    raise exception 'INVALID_GUEST';
  end if;
  perform 1 from public.lodging_guest_assignments where reservation_id=p_reservation_id for update;

  if p_operation='place' then
    select * into assignment from public.place_lodging_guest(p_reservation_id,p_guest_index,p_room_name);
    next_status := 'in_progress';
  elsif p_operation='remove' then
    perform public.unplace_lodging_guest(p_reservation_id,p_guest_index);
    next_status := case when exists(select 1 from public.lodging_guest_assignments where reservation_id=p_reservation_id) then 'in_progress' else 'pending' end;
  elsif p_operation='reopen' then
    next_status := 'in_progress';
  else
    -- Une ligne par vrai voyageur et toutes ses nuits, pas seulement un compteur.
    if (select count(*) from public.lodging_guest_assignments where reservation_id=p_reservation_id)<>reservation.guests_count
      or exists(select 1 from generate_series(1,reservation.guests_count) guest(index)
        left join public.lodging_guest_assignments a on a.reservation_id=p_reservation_id and a.guest_index=guest.index
        where a.id is null or a.guest_name is distinct from reservation.guest_names[guest.index]
          or not coalesce(a.assigned_nights,reservation.nights) @> reservation.nights
          or public.lodging_room_capacity(a.room_name) is null or public.lodging_room_capacity(a.room_name)=0) then
      raise exception 'INCOMPLETE_PLACEMENT';
    end if;
    for room in select distinct room_name from public.lodging_guest_assignments where reservation_id=p_reservation_id order by room_name loop
      capacity := public.lodging_room_capacity(room);
      foreach night in array reservation.nights loop
        select count(*) into occupied from public.lodging_guest_assignments a
          join public.lodging_reservations r on r.id=a.reservation_id
          where a.room_name=room and r.booking_status='active'
            and night=any(coalesce(a.assigned_nights,r.nights));
        if occupied>capacity then raise exception 'ROOM_FULL_%',night; end if;
      end loop;
    end loop;
    next_status := 'finalized';
  end if;
  update public.lodging_reservations set placement_status=next_status,updated_at=clock_timestamp() where id=p_reservation_id;
  return jsonb_build_object('assignment',case when p_operation='place' then to_jsonb(assignment) else null end,'placement_status',next_status);
end;
$$;

revoke all on function public.admin_lodging_placement(text,uuid,smallint,text) from public,anon,authenticated;
grant execute on function public.admin_lodging_placement(text,uuid,smallint,text) to service_role;
notify pgrst,'reload schema';
commit;
