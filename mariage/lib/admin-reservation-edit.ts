import "server-only";

import { getPrivateSupabaseConfig } from "@/lib/admin-data";
import { LODGING_NIGHTS, LODGING_PRICE_CENTS, type LodgingGuestAssignment, type LodgingReservation } from "@/lib/lodging";
import { planLodgingPlacementReconciliation } from "@/lib/lodging-placement";
import { lodgingAmount, recordToInput, registrationRow, validateRegistrationInput, type RegistrationRecord } from "@/lib/registration";

export class AdminReservationError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) { super(message); }
}
export type AdminReservationSnapshot = {
  reservation: Omit<LodgingReservation, "access_token">;
  registration: Omit<RegistrationRecord, "management_token_hash"> | null;
  assignments: LodgingGuestAssignment[];
  legacy: Array<{ id: string; updated_at: string }>;
};
export type AdminReservationVersion = { id: string; reservationUpdatedAt: string; registrationUpdatedAt: string | null };
export function isReservationId(id: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id); }

async function rpc(name: string, body: Record<string, unknown>) {
  const { url, headers } = getPrivateSupabaseConfig();
  let response: Response;
  try {
    response = await fetch(`${url}/rest/v1/rpc/${name}`, {
      method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body),
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000),
    });
  } catch { throw new AdminReservationError("database_unavailable", "La base est indisponible. Vos modifications ne sont pas confirmées : rechargez avant de réessayer.", 503); }
  if (!response.ok) {
    const detail = await response.text();
    const errors: Array<[string, string, number]> = [
      ["EDIT_CONFLICT", "La réservation ou son placement a changé depuis l’ouverture. Rechargez la page avant de modifier à nouveau.", 409],
      ["REVIEW_PENDING", "Traitez d’abord la modification financière en attente dans l’administration.", 409],
      ["NIGHT_FULL", "Il ne reste pas assez de couchages pour une des nuits choisies.", 409],
      ["ROOM_FULL", "Une chambre déjà attribuée manque de place pour ces nouvelles nuitées. Revoyez le placement avant de modifier la réservation.", 409],
      ["LEGACY_PLACEMENT", "Ce placement historique doit être repris dans le plan nominatif avant de changer les voyageurs ou les nuitées.", 409],
      ["RESERVATION_NOT_FOUND", "Cette réservation est introuvable.", 404],
    ];
    const known = errors.find(([code]) => detail.includes(code));
    if (known) throw new AdminReservationError(...known);
    throw new AdminReservationError("database_failed", "La modification n’a pas pu être confirmée. Rechargez la page pour vérifier la réservation.", 503);
  }
  return response.json();
}

export async function readAdminReservation(id: string): Promise<AdminReservationSnapshot | null> {
  if (!isReservationId(id)) throw new AdminReservationError("invalid_id", "Réservation invalide.");
  return rpc("admin_reservation_snapshot", { p_id: id });
}

function text(value: unknown, limit: number) { return typeof value === "string" ? value.trim().slice(0, limit) : ""; }
function standaloneValues(body: Record<string, unknown>) {
  const guestNames = Array.isArray(body.guestNames) ? body.guestNames.map(v => text(v, 80)).filter(Boolean) : [];
  const nights = Array.isArray(body.nights) ? [...new Set(body.nights.map(String))].sort() : [];
  const bookerName = text(body.bookerName, 80), phone = text(body.phone, 30), email = text(body.email, 120).toLowerCase();
  const paymentMethod = String(body.paymentMethod);
  const bookingStatus = String(body.bookingStatus);
  if (bookerName.length < 2 || phone.replace(/\D/g, "").length < 8 || guestNames.length < 1 || guestNames.length > 20
    || nights.length < 1 || nights.length > 2 || nights.some(n => !LODGING_NIGHTS.includes(n as typeof LODGING_NIGHTS[number]))
    || !["wero", "bank_transfer", "later"].includes(paymentMethod) || !["active", "cancelled"].includes(bookingStatus)
    || email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AdminReservationError("invalid_details", "Vérifiez le responsable, les coordonnées, les voyageurs et les nuits demandées.");
  }
  return { booker_name: bookerName, phone, email: email || null, guest_names: guestNames, guests_count: guestNames.length,
    nights, amount_cents: guestNames.length * nights.length * LODGING_PRICE_CENTS,
    roommate_wishes: text(body.roommateWishes, 500) || null, payment_method: paymentMethod, booking_status: bookingStatus };
}

export function prepareAdminReservationEdit(snapshot: AdminReservationSnapshot, body: Record<string, unknown>) {
  const old = snapshot.reservation;
  if (old.financial_review_status === "pending") throw new AdminReservationError("REVIEW_PENDING", "Traitez d’abord la modification financière en attente.", 409);
  let responseValues: ReturnType<typeof registrationRow> | null = null;
  let values: ReturnType<typeof standaloneValues>;
  if (snapshot.registration) {
    const input = validateRegistrationInput(body);
    if (input.respondentName.length < 2) throw new AdminReservationError("invalid_name", "Indiquez le nom et le prénom du responsable.");
    const amount = lodgingAmount(input);
    responseValues = registrationRow(input);
    values = { booker_name: input.respondentName, email: input.respondentEmail, phone: amount ? input.phone : old.phone,
      guest_names: amount ? input.lodgingGuestNames : old.guest_names, guests_count: amount ? input.lodgingGuestNames.length : old.guests_count,
      nights: amount ? input.lodgingNights : old.nights, amount_cents: amount || old.amount_cents,
      roommate_wishes: input.roommateWishes || null, payment_method: amount ? input.paymentMethod : old.payment_method,
      booking_status: amount ? "active" : "cancelled" };
  } else values = standaloneValues(body);

  const placementChanged = values.booking_status !== old.booking_status
    || JSON.stringify(values.guest_names) !== JSON.stringify(old.guest_names)
    || JSON.stringify([...values.nights].sort()) !== JSON.stringify([...old.nights].sort());
  if (placementChanged && values.booking_status === "active" && snapshot.legacy.length) {
    throw new AdminReservationError("LEGACY_PLACEMENT", "Reprenez le placement historique dans le plan nominatif avant cette modification.", 409);
  }
  const plan = planLodgingPlacementReconciliation(snapshot.assignments, values.guest_names);
  const assignments = values.booking_status === "cancelled" || old.booking_status === "cancelled" ? [] : plan.upserts.flatMap(p => {
    const original = snapshot.assignments.find(a => a.guest_index === p.fromGuestIndex)!;
    const covered = (original.assigned_nights ?? old.nights).filter(n => values.nights.includes(n));
    return covered.length ? [{ guest_index: p.toGuestIndex, guest_name: values.guest_names[p.toGuestIndex - 1],
      room_name: p.roomName, assigned_nights: covered }] : [];
  });
  return { values, responseValues, assignments, placementChanged };
}

export function adminRegistrationData(snapshot: AdminReservationSnapshot) {
  if (!snapshot.registration) return null;
  return { registration: { id: snapshot.registration.id, ...recordToInput(snapshot.registration as RegistrationRecord) },
    reservation: { reference: snapshot.reservation.reference, amountCents: snapshot.reservation.amount_cents,
      paymentStatus: snapshot.reservation.payment_status, bookingStatus: snapshot.reservation.booking_status,
      financialReviewStatus: snapshot.reservation.financial_review_status ?? "none",
      previousAmountCents: snapshot.reservation.previous_amount_cents ?? null, proposedAmountCents: snapshot.reservation.proposed_amount_cents ?? null } };
}

export async function saveAdminReservation(id: string, body: Record<string, unknown>) {
  const snapshot = await readAdminReservation(id);
  if (!snapshot) throw new AdminReservationError("RESERVATION_NOT_FOUND", "Cette réservation est introuvable.", 404);
  const edit = prepareAdminReservationEdit(snapshot, body);
  if (typeof body.expectedReservationUpdatedAt !== "string"
    || snapshot.registration && typeof body.expectedRegistrationUpdatedAt !== "string") {
    throw new AdminReservationError("missing_version", "Rechargez le formulaire avant d’enregistrer.", 409);
  }
  const result = await rpc("admin_update_reservation", { p_id: id,
    p_expected_reservation_updated_at: body.expectedReservationUpdatedAt,
    p_expected_response_updated_at: snapshot.registration ? body.expectedRegistrationUpdatedAt : null,
    p_expected_assignments: snapshot.assignments.map(a => ({ id: a.id, updated_at: a.updated_at })),
    p_expected_legacy: snapshot.legacy.map(a => ({ id: a.id, updated_at: a.updated_at })),
    p_reservation: edit.values, p_response: edit.responseValues, p_assignments: edit.assignments,
    p_placement_changed: edit.placementChanged,
  });
  return { success: true, newAmountCents: edit.values.amount_cents, reservationUpdatedAt: result.updated_at };
}
