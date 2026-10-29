import "server-only";

import { adminEditRpc, AdminReservationError, isReservationId } from "@/lib/admin-reservation-edit";
import { recordToInput, registrationRow, validateRegistrationInput, type RegistrationRecord } from "@/lib/registration";

export type AdminRegistrationVersion = { id: string; registrationUpdatedAt: string };
export type AdminRegistrationSnapshot = {
  registration: Omit<RegistrationRecord, "management_token_hash">;
  reservationId: string | null;
};

export async function readAdminRegistration(id: string): Promise<AdminRegistrationSnapshot | null> {
  if (!isReservationId(id)) throw new AdminReservationError("invalid_id", "Inscription invalide.");
  return adminEditRpc("admin_registration_snapshot", { p_id: id });
}

export function adminRegistrationForm(snapshot: AdminRegistrationSnapshot) {
  return { registration: { id: snapshot.registration.id, ...recordToInput(snapshot.registration as RegistrationRecord) }, reservation: null };
}

export async function saveAdminRegistration(id: string, body: Record<string, unknown>) {
  if (!isReservationId(id)) throw new AdminReservationError("invalid_id", "Inscription invalide.");
  if (typeof body.expectedRegistrationUpdatedAt !== "string") {
    throw new AdminReservationError("missing_version", "Rechargez le formulaire avant d’enregistrer.", 409);
  }
  const input = validateRegistrationInput(body);
  if (input.respondentName.length < 2) throw new AdminReservationError("invalid_name", "Indiquez le nom et le prénom du répondant.");
  // La transaction refuse un hébergement apparu entre l’ouverture et l’enregistrement.
  // Les réservations déjà liées restent gérées par l’éditeur existant.
  const result = await adminEditRpc("admin_update_registration", {
    p_id: id, p_expected_updated_at: body.expectedRegistrationUpdatedAt, p_response: registrationRow(input),
  });
  return { success: true, registrationUpdatedAt: result.updated_at, reservationId: result.reservation_id, newAmountCents: result.amount_cents };
}
