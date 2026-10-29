import type { DigestWindow } from "./time";

export type DigestRegistration = {
  id: string; respondent_name: string; companions: string[]; attendance_days: string[];
  not_attending: boolean; created_at: string; lodging_guest_names: string[];
  lodging_nights: string[]; roommate_wishes: string | null; lodging_reservation_id: string | null;
};
export type DigestReservation = {
  id: string; reference: string; booker_name: string; guest_names: string[]; guests_count: number;
  nights: string[]; amount_cents: number; received_amount_cents: number | null;
  payment_method: string; payment_status: string; booking_status: string;
  roommate_wishes: string | null; wedding_response_id: string | null;
  financial_review_status: string | null; proposed_amount_cents: number | null;
};
export type DigestAssignment = {
  reservation_id: string; guest_index: number; guest_name: string; room_name: string;
  assigned_nights: string[] | null;
};
export type DigestLegacyAssignment = {
  reservation_id: string; room_name: string; friday_adults: number; friday_children: number;
  friday_babies: number; saturday_adults: number; saturday_children: number; saturday_babies: number;
};
export type DigestSnapshot = {
  captured_at: string; registrations: DigestRegistration[]; reservations: DigestReservation[];
  assignments: DigestAssignment[]; legacy_assignments: DigestLegacyAssignment[];
};
export class DigestDataError extends Error {
  constructor(public readonly code: string) { super(code); }
}

function check(condition: unknown, code: string): asserts condition {
  if (!condition) throw new DigestDataError(code);
}
function integer(value: number) { return Number.isSafeInteger(value) && value >= 0; }
function names(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(name => typeof name === "string" && name.trim().length > 0);
}
function sameName(a: string, b: string) { return a.trim().toLocaleLowerCase("fr") === b.trim().toLocaleLowerCase("fr"); }

export function buildWeeklyDigest(snapshot: DigestSnapshot, window: DigestWindow, priceCents: number, nights: readonly string[]) {
  check(snapshot && Number.isFinite(Date.parse(snapshot.captured_at)), "invalid_snapshot");
  for (const field of [snapshot.registrations, snapshot.reservations, snapshot.assignments, snapshot.legacy_assignments]) {
    check(Array.isArray(field), "invalid_snapshot");
  }
  check(integer(priceCents) && priceCents > 0, "invalid_price");
  const warnings: string[] = [];
  for (const r of snapshot.registrations) {
    check(typeof r.id === "string" && typeof r.respondent_name === "string" && r.respondent_name.trim(), "invalid_registration");
    check(names(r.companions) && Array.isArray(r.attendance_days) && Array.isArray(r.lodging_nights)
      && names(r.lodging_guest_names) && typeof r.not_attending === "boolean"
      && Number.isFinite(Date.parse(r.created_at)), "invalid_registration");
  }
  const newRegistrations = snapshot.registrations.filter(r => Date.parse(r.created_at) >= Date.parse(window.start)
    && Date.parse(r.created_at) < Date.parse(window.end));
  const attending = snapshot.registrations.filter(r => !r.not_attending);
  const newAttending = newRegistrations.filter(r => !r.not_attending);
  const active = snapshot.reservations.filter(r => r.booking_status === "active");
  const unplaced: Array<{ key: string; name: string; nights: string[]; wishes: string | null; reference: string }> = [];
  const payments: Array<DigestReservation & { due: number | null; expected: number }> = [];
  const placementByNight = Object.fromEntries(nights.map(n => [n, 0])) as Record<string, number>;
  let unknownReceipts = 0;
  let outstandingCents = 0;

  for (const reservation of active) {
    check(names(reservation.guest_names) && integer(reservation.guests_count)
      && reservation.guests_count === reservation.guest_names.length && reservation.guests_count > 0, "invalid_lodging_guests");
    check(Array.isArray(reservation.nights) && reservation.nights.length > 0
      && new Set(reservation.nights).size === reservation.nights.length
      && reservation.nights.every(n => nights.includes(n)), "invalid_lodging_nights");
    check(integer(reservation.amount_cents), "invalid_lodging_amount");
    check(reservation.received_amount_cents === null || integer(reservation.received_amount_cents), "unknown_receipt_schema");
    const expected = priceCents * reservation.guests_count * reservation.nights.length;
    if (expected !== reservation.amount_cents) warnings.push(`${reservation.reference} : montant enregistré différent du tarif de 35 € par personne et par nuit.`);
    if (reservation.financial_review_status === "pending") warnings.push(`${reservation.reference} : modification financière à valider ; le solde utilise le montant de réservation actuellement validé.`);
    if (reservation.received_amount_cents === null) {
      unknownReceipts++;
      payments.push({ ...reservation, due: null, expected });
    } else {
      const due = Math.max(0, reservation.amount_cents - reservation.received_amount_cents);
      outstandingCents += due;
      if (due > 0) payments.push({ ...reservation, due, expected });
    }

    const assignments = snapshot.assignments.filter(a => a.reservation_id === reservation.id);
    const legacy = snapshot.legacy_assignments.filter(a => a.reservation_id === reservation.id);
    check(legacy.length <= 1, "ambiguous_legacy_assignment");
    const seenIndexes = new Set<number>();
    for (const assignment of assignments) {
      check(integer(assignment.guest_index) && assignment.guest_index >= 1 && assignment.guest_index <= reservation.guests_count
        && !seenIndexes.has(assignment.guest_index) && Boolean(assignment.room_name?.trim()), "invalid_assignment");
      seenIndexes.add(assignment.guest_index);
      check(sameName(assignment.guest_name, reservation.guest_names[assignment.guest_index - 1]), "stale_assignment");
      check(assignment.assigned_nights === null || Array.isArray(assignment.assigned_nights)
        && new Set(assignment.assigned_nights).size === assignment.assigned_nights.length
        && assignment.assigned_nights.every(n => nights.includes(n)), "invalid_assignment_nights");
    }
    reservation.guest_names.forEach((name, index) => {
      const assignment = assignments.find(a => a.guest_index === index + 1);
      const missingNights = reservation.nights.filter(night => {
        if (assignment) return !(assignment.assigned_nights ?? reservation.nights).includes(night);
        // Only a complete, nominatively unambiguous legacy group can establish placement.
        if (!assignments.length && legacy.length) {
          const a = legacy[0];
          const count = night === nights[0]
            ? a.friday_adults + a.friday_children + a.friday_babies
            : a.saturday_adults + a.saturday_children + a.saturday_babies;
          check(integer(count) && (count === 0 || count === reservation.guests_count), "ambiguous_legacy_assignment");
          return count === 0;
        }
        return true;
      });
      if (missingNights.length) {
        unplaced.push({ key: `${reservation.id}:${index + 1}`, name, nights: missingNights, wishes: reservation.roommate_wishes, reference: reservation.reference });
        for (const night of missingNights) placementByNight[night]++;
      }
    });
  }
  // An orphan request is a data problem, not an empty reservation list.
  for (const registration of attending.filter(r => r.lodging_nights.length)) {
    const linked = snapshot.reservations.find(r => r.id === registration.lodging_reservation_id || r.wedding_response_id === registration.id);
    check(linked, "lodging_request_without_reservation");
    if (linked.financial_review_status === "pending") continue;
    if (linked.booking_status === "active") {
      check(registration.lodging_guest_names.length === linked.guests_count
        && registration.lodging_guest_names.every((name, index) => sameName(name, linked.guest_names[index])), "registration_lodging_mismatch");
    }
  }
  if (unknownReceipts) warnings.push(`${unknownReceipts} réservation(s) sans montant encaissé vérifié. Aucun solde global ne peut être certifié.`);

  return {
    window, capturedAt: snapshot.captured_at,
    newRegistrations, newFormCount: newRegistrations.length,
    newPeopleCount: newAttending.reduce((total, r) => total + 1 + r.companions.length, 0),
    newDeclinedCount: newRegistrations.length - newAttending.length,
    totalPeopleCount: attending.reduce((total, r) => total + 1 + r.companions.length, 0),
    unplaced, placementByNight, payments,
    outstandingCents: unknownReceipts ? null : outstandingCents,
    unknownReceipts, warnings, priceCents, nights: [...nights],
  };
}

export type WeeklyDigest = ReturnType<typeof buildWeeklyDigest>;
export function assertDigestSendable(digest: WeeklyDigest) {
  if (digest.unknownReceipts) throw new DigestDataError("unverified_receipts");
}
