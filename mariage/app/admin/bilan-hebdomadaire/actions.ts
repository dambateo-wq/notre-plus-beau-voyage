"use server";

import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getPrivateSupabaseConfig } from "@/lib/admin-data";
import { readDigestSnapshot, runWeeklyDigest } from "@/lib/weekly-digest/server";
import { latestDigestWindow } from "@/lib/weekly-digest/time";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const PAGE = "/admin/bilan-hebdomadaire";
async function requireAdmin() {
  if (!(await isAdminAuthenticated())) redirect("/admin");
}
function uuid(value: FormDataEntryValue | null) {
  const id = String(value ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Référence invalide.");
  return id;
}

export async function sendDigestTest(form: FormData) {
  await requireAdmin();
  if (process.env.WEEKLY_DIGEST_TEST_ENABLED !== "true") redirect(`${PAGE}?result=test_desactive`);
  let result = "test_echoue";
  try {
    const outcome = await runWeeklyDigest(latestDigestWindow(), "test", String(form.get("testKey") ?? ""));
    result = outcome.status === "sent" ? "test_envoye_ou_deja_envoye" : outcome.status === "uncertain" ? "envoi_incertain" : "test_en_cours";
  } catch { /* The private journal contains the safe failure code. */ }
  redirect(`${PAGE}?result=${result}`);
}

export async function saveVerifiedReceipt(form: FormData) {
  await requireAdmin();
  const id = uuid(form.get("reservationId"));
  const amount = String(form.get("amount") ?? "").trim();
  const match = /^(\d{1,7})(?:[,.](\d{1,2}))?$/.exec(amount);
  if (!match) throw new Error("Saisissez un montant en euros avec deux décimales au maximum.");
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  const snapshot = await readDigestSnapshot();
  const reservation = snapshot.reservations.find(r => r.id === id && r.booking_status === "active");
  if (!reservation) throw new Error("La réservation n’est plus active.");
  const { url, headers } = getPrivateSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/lodging_reservations?id=eq.${id}&booking_status=eq.active&amount_cents=eq.${reservation.amount_cents}&select=id`, {
    method: "PATCH", headers: { ...headers, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ received_amount_cents: cents,
      payment_status: cents >= reservation.amount_cents ? "confirmed" : reservation.payment_status === "confirmed" ? "unpaid" : reservation.payment_status,
      updated_at: new Date().toISOString() }),
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000),
  });
  if (!response.ok || (await response.json()).length !== 1) throw new Error("L’encaissement n’a pas pu être enregistré. Rechargez la page pour vérifier la réservation.");
  revalidatePath(PAGE); revalidatePath("/admin");
  redirect(`${PAGE}?result=encaissement_enregistre`);
}

export async function saveAssignmentNights(form: FormData) {
  await requireAdmin();
  const id = uuid(form.get("reservationId"));
  const guestIndex = Number(form.get("guestIndex"));
  const nights = [...new Set(form.getAll("nights").map(String))];
  const snapshot = await readDigestSnapshot();
  const reservation = snapshot.reservations.find(r => r.id === id && r.booking_status === "active");
  if (!reservation || reservation.financial_review_status === "pending"
    || !Number.isInteger(guestIndex) || guestIndex < 1 || guestIndex > reservation.guests_count
    || nights.length === 0 || nights.some(n => !reservation.nights.includes(n))) {
    throw new Error("Choisissez les nuits réservées couvertes par cette affectation. Pour retirer toutes les nuits, utilisez le retrait de placement habituel.");
  }
  if (!snapshot.assignments.some(a => a.reservation_id === id && a.guest_index === guestIndex)) throw new Error("L’affectation n’existe plus.");
  const { url, headers } = getPrivateSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/lodging_guest_assignments?reservation_id=eq.${id}&guest_index=eq.${guestIndex}&select=reservation_id`, {
    method: "PATCH", headers: { ...headers, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ assigned_nights: nights, updated_at: new Date().toISOString() }),
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000),
  });
  if (!response.ok || (await response.json()).length !== 1) throw new Error("Les nuits de l’affectation n’ont pas pu être enregistrées. Rechargez la page pour vérifier le placement.");
  revalidatePath(PAGE); revalidatePath("/admin");
  redirect(`${PAGE}?result=nuits_enregistrees`);
}
