import "server-only";

import { getPrivateSupabaseConfig } from "@/lib/admin-data";
import { LODGING_ROOM_NAMES } from "@/lib/lodging-rooms";
import type { LodgingGuestAssignment } from "@/lib/lodging";

export type PlacementActionResult =
  | { ok: true; assignment: LodgingGuestAssignment | null; placementStatus: "pending" | "in_progress" | "finalized" }
  | { ok: false; error: string; refreshRequired?: boolean };
export type PlacementOperation = "place" | "remove" | "finalize" | "reopen";

const uncertain = (): PlacementActionResult => ({ ok: false, refreshRequired: true,
  error: "L’enregistrement n’a pas pu être confirmé. Actualisez le plan pour vérifier le placement avant de réessayer." });

export async function performAdminLodgingPlacement(operation: PlacementOperation, form: FormData): Promise<PlacementActionResult> {
  const reservationId = String(form.get("reservationId") ?? "");
  const guestIndex = Number(form.get("guestIndex"));
  const roomName = String(form.get("roomName") ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reservationId)
    || (operation === "place" || operation === "remove") && (!Number.isInteger(guestIndex) || guestIndex < 1 || guestIndex > 20)
    || operation === "place" && !LODGING_ROOM_NAMES.includes(roomName as typeof LODGING_ROOM_NAMES[number])) {
    return { ok: false, error: "Vérifiez la réservation, le voyageur et la chambre choisis." };
  }
  try {
    const { url, headers } = getPrivateSupabaseConfig();
    const response = await fetch(`${url}/rest/v1/rpc/admin_lodging_placement`, {
      method: "POST", headers: { ...headers, "Content-Type": "application/json" }, cache: "no-store", redirect: "error",
      signal: AbortSignal.timeout(12000), body: JSON.stringify({ p_operation: operation, p_reservation_id: reservationId,
        p_guest_index: operation === "place" || operation === "remove" ? guestIndex : null, p_room_name: operation === "place" ? roomName : null }),
    });
    if (!response.ok) {
      const detail = await response.text();
      const messages: Array<[string, string]> = [
        ["ROOM_FULL", "Cette chambre est complète pour au moins une des nuits choisies. L’attribution précédente est conservée."],
        ["REVIEW_PENDING", "Cette réservation a une modification financière en attente. Validez-la ou refusez-la avant de modifier le placement."],
        ["RESERVATION_NOT_PLACEABLE", "Cette réservation n’est plus active ou n’existe plus. Actualisez le plan."],
        ["INVALID_GUEST", "Ce voyageur ne correspond plus à la réservation. Actualisez le plan."],
        ["INVALID_ROOM", "Cette chambre n’existe pas ou est réservée aux mariés."],
        ["INVALID_NIGHTS", "Les nuitées de cette réservation doivent être vérifiées avant le placement."],
        ["INCOMPLETE_PLACEMENT", "Tous les voyageurs doivent avoir une chambre pour chacune de leurs nuits avant de confirmer le placement."],
      ];
      const known = messages.find(([code]) => detail.includes(code));
      if (known) return { ok: false, error: known[1], refreshRequired: ["INVALID_GUEST", "RESERVATION_NOT_PLACEABLE"].includes(known[0]) };
      if (detail.includes("55P03") || detail.includes("40P01")) return { ok: false, error: "Une autre modification est en cours. Réessayez dans quelques instants." };
      return uncertain();
    }
    const data = await response.json();
    if (!data || !["pending", "in_progress", "finalized"].includes(data.placement_status)
      || operation === "place" && (!data.assignment?.id || data.assignment.reservation_id !== reservationId
        || data.assignment.guest_index !== guestIndex || data.assignment.room_name !== roomName)) return uncertain();
    return { ok: true, assignment: data.assignment ?? null, placementStatus: data.placement_status };
  } catch { return uncertain(); }
}
