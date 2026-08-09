"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { COUPLE_LODGING, LODGING_ROOMS } from "@/lib/lodging-rooms";
import type { LodgingGuestAssignment, LodgingReservation } from "@/lib/lodging";
import {
  removeGuestLodgingPlacement,
  saveGuestLodgingPlacement,
} from "./actions";
import styles from "./admin.module.css";

type Guest = {
  key: string;
  reservationId: string;
  guestIndex: number;
  name: string;
  reference: string;
  nights: string[];
};

function guestsFor(reservation: LodgingReservation): Guest[] {
  return Array.from({ length: reservation.guests_count }, (_, index) => ({
    key: `${reservation.id}:${index + 1}`,
    reservationId: reservation.id,
    guestIndex: index + 1,
    name: reservation.guest_names[index]?.trim() ||
      (index === 0 ? reservation.booker_name : `${reservation.booker_name} · ${index + 1}`),
    reference: reservation.reference,
    nights: reservation.nights,
  }));
}

export default function LodgingGuestPlanner({
  reservations,
  initialAssignments,
}: {
  reservations: LodgingReservation[];
  initialAssignments: LodgingGuestAssignment[];
}) {
  const placeable = reservations.filter(
    (reservation) => reservation.booking_status === "active" && reservation.payment_status === "confirmed",
  );
  const guests = placeable.flatMap(guestsFor);
  const [assignments, setAssignments] = useState(initialAssignments);
  const [pending, startTransition] = useTransition();
  const [pendingGuest, setPendingGuest] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const assignmentFor = (guest: Guest) => assignments.find(
    (item) => item.reservation_id === guest.reservationId && item.guest_index === guest.guestIndex,
  );

  function occupancy(roomName: string, night: string) {
    return assignments.filter((assignment) => {
      if (assignment.room_name !== roomName) return false;
      return placeable.find((reservation) => reservation.id === assignment.reservation_id)?.nights.includes(night);
    }).length;
  }

  function moveGuest(guest: Guest, roomName: string) {
    setError("");
    setPendingGuest(guest.key);
    startTransition(async () => {
      const previous = assignments;
      try {
        if (!roomName) {
          setAssignments((current) => current.filter(
            (item) => !(item.reservation_id === guest.reservationId && item.guest_index === guest.guestIndex),
          ));
          const form = new FormData();
          form.set("reservationId", guest.reservationId);
          form.set("guestIndex", String(guest.guestIndex));
          await removeGuestLodgingPlacement(form);
        } else {
          setAssignments((current) => [
            ...current.filter((item) => !(item.reservation_id === guest.reservationId && item.guest_index === guest.guestIndex)),
            {
              id: assignmentFor(guest)?.id ?? `pending-${guest.key}`,
              reservation_id: guest.reservationId,
              guest_index: guest.guestIndex,
              guest_name: guest.name,
              room_name: roomName,
              updated_at: new Date().toISOString(),
            },
          ]);
          const form = new FormData();
          form.set("reservationId", guest.reservationId);
          form.set("guestIndex", String(guest.guestIndex));
          form.set("roomName", roomName);
          const saved = await saveGuestLodgingPlacement(form);
          setAssignments((current) => current.map((item) =>
            item.reservation_id === guest.reservationId && item.guest_index === guest.guestIndex ? saved : item,
          ));
        }
        router.refresh();
      } catch (caught) {
        setAssignments(previous);
        setError(caught instanceof Error ? caught.message : "Le placement n’a pas pu être enregistré.");
      } finally {
        setPendingGuest("");
      }
    });
  }

  return (
    <section className={styles.guestPlanner} aria-labelledby="guest-planner-title">
      <div className={styles.floorPlansHeading}>
        <div>
          <p className={styles.eyebrow}>Placement individuel</p>
          <h3 id="guest-planner-title">Répartir chaque voyageur</h3>
        </div>
        <p>Glissez chaque nom vers une chambre. Sur téléphone, utilisez directement le menu sous le nom.</p>
      </div>

      {error && <p className={styles.plannerError} role="alert">{error}</p>}

      <div className={styles.guestGroups}>
        {placeable.map((reservation) => {
          const group = guestsFor(reservation);
          const placed = group.filter((guest) => assignmentFor(guest)).length;
          return (
            <article className={styles.guestGroup} key={reservation.id}>
              <header><strong>{reservation.booker_name}</strong><span>{placed}/{group.length} placés · {reservation.reference}</span></header>
              <div>
                {group.map((guest) => {
                  const assignment = assignmentFor(guest);
                  return (
                    <div
                      className={styles.guestChip}
                      draggable={!pending}
                      key={guest.key}
                      onDragStart={(event) => event.dataTransfer.setData("text/plain", guest.key)}
                    >
                      <span><strong>{guest.name}</strong><small>{assignment ? assignment.room_name : "Non placé"}</small></span>
                      <select
                        aria-label={`Chambre de ${guest.name}`}
                        disabled={pendingGuest === guest.key}
                        value={assignment?.room_name ?? ""}
                        onChange={(event) => moveGuest(guest, event.target.value)}
                      >
                        <option value="">Non placé</option>
                        {LODGING_ROOMS.map((room) => <option key={room.name} value={room.name}>{room.name}</option>)}
                      </select>
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>

      {placeable.length === 0 ? (
        <p className={styles.empty}>Confirmez un paiement pour commencer le placement individuel.</p>
      ) : (
        <div className={styles.roomDropGrid}>
          <article
            aria-label={`${COUPLE_LODGING.name}, réservé à ${COUPLE_LODGING.occupants.join(" et ")}`}
            className={`${styles.roomDrop} ${styles.coupleRoom}`}
          >
            <header>
              <strong>{COUPLE_LODGING.name}</strong>
              <span>V 2/2 · S 2/2</span>
            </header>
            <div>
              {COUPLE_LODGING.occupants.map((occupant) => <span key={occupant}>{occupant}</span>)}
              <small>Réservé aux mariés</small>
            </div>
          </article>
          {LODGING_ROOMS.map((room) => {
            const roomGuests = guests.filter((guest) => assignmentFor(guest)?.room_name === room.name);
            const friday = occupancy(room.name, "2027-05-28");
            const saturday = occupancy(room.name, "2027-05-29");
            return (
              <article
                className={styles.roomDrop}
                key={room.name}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const key = event.dataTransfer.getData("text/plain");
                  const guest = guests.find((item) => item.key === key);
                  if (guest) moveGuest(guest, room.name);
                }}
              >
                <header><strong>{room.name}</strong><span>V {friday}/{room.capacity} · S {saturday}/{room.capacity}</span></header>
                <div>{roomGuests.length ? roomGuests.map((guest) => <span key={guest.key}>{guest.name}</span>) : <small>Déposer un nom ici</small>}</div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
