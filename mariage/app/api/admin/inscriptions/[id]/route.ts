import { isAdminAuthenticated } from "@/lib/admin-auth";
import { saveAdminRegistration } from "@/lib/admin-registration-edit";
import { AdminReservationError } from "@/lib/admin-reservation-edit";
import { RegistrationValidationError } from "@/lib/registration";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "CDN-Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Votre session administrateur a expiré." }, { status: 401, headers });
  if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "Origine refusée." }, { status: 403, headers });
  try {
    const { id } = await context.params;
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "Formulaire invalide." }, { status: 400, headers });
    const result = await saveAdminRegistration(id, body);
    revalidatePath("/admin"); revalidatePath(`/admin/inscriptions/${id}`); revalidatePath("/admin/bilan-hebdomadaire"); revalidatePath("/");
    if (result.reservationId) revalidatePath(`/admin/reservations/${result.reservationId}`);
    return Response.json(result, { headers });
  } catch (error) {
    if (error instanceof AdminReservationError) return Response.json({ error: error.message, code: error.code }, { status: error.status, headers });
    if (error instanceof RegistrationValidationError) return Response.json({ error: error.message }, { status: 400, headers });
    if (error instanceof SyntaxError) return Response.json({ error: "Formulaire invalide." }, { status: 400, headers });
    return Response.json({ error: "La modification n’a pas pu être confirmée. Rechargez la page pour vérifier l’inscription." }, { status: 503, headers });
  }
}
