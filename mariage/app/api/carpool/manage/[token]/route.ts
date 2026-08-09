import { getPrivateSupabaseConfig } from "@/lib/admin-data";
import {
  isAllowedCarpoolDate,
  parisLocalToInstant,
} from "@/lib/carpool-time";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function clean(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

async function tokenFrom(context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  return UUID.test(token) ? token : "";
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const token = await tokenFrom(context);
  if (!token) return Response.json({ error: "Lien invalide." }, { status: 404 });

  const { url, headers } = getPrivateSupabaseConfig();
  const response = await fetch(
    `${url}/rest/v1/carpool_offers?management_token=eq.${token}&select=id,driver_name,driver_email,direction,other_place,departure_local,seats_available,seats_total,contact,details,created_at,carpool_seats(id,position,status,passenger_name,passenger_contact,passenger_message,updated_at)&carpool_seats.order=position.asc`,
    { headers, cache: "no-store" },
  );
  const [offer] = response.ok ? await response.json() : [];
  if (!offer) return Response.json({ error: "Annonce introuvable." }, { status: 404 });
  return Response.json({ offer });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const token = await tokenFrom(context);
  if (!token) return Response.json({ error: "Lien invalide." }, { status: 404 });
  const body = (await request.json()) as Record<string, unknown>;
  const { url, headers } = getPrivateSupabaseConfig();

  if (body.action === "cycle-seat") {
    const seatId = clean(body.seatId, 36);
    if (!UUID.test(seatId)) return Response.json({ error: "Place invalide." }, { status: 400 });
    const response = await fetch(`${url}/rest/v1/rpc/cycle_carpool_seat`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ p_management_token: token, p_seat_id: seatId }),
      cache: "no-store",
    });
    if (!response.ok) return Response.json({ error: "Cette place n’a pas pu être modifiée." }, { status: 409 });
    const [seat] = await response.json();
    return Response.json({ seat });
  }

  const driverName = clean(body.driverName, 80);
  const direction = clean(body.direction, 20);
  const otherPlace = clean(body.otherPlace, 140);
  const departureLocal = clean(body.departureAt, 40);
  const contact = clean(body.contact, 120);
  const details = clean(body.details, 500);
  if (
    !driverName || !otherPlace || !contact ||
    !["to_massacan", "from_massacan"].includes(direction) ||
    !isAllowedCarpoolDate(departureLocal)
  ) {
    return Response.json({ error: "Vérifiez les informations du trajet." }, { status: 400 });
  }

  const response = await fetch(
    `${url}/rest/v1/carpool_offers?management_token=eq.${token}`,
    {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({
        driver_name: driverName,
        direction,
        other_place: otherPlace,
        departure_local: departureLocal.replace("T", " ") + ":00",
        departure_at: parisLocalToInstant(departureLocal).toISOString(),
        contact,
        details: details || null,
      }),
      cache: "no-store",
    },
  );
  const updated = response.ok ? await response.json() : [];
  if (!response.ok) return Response.json({ error: "L’annonce n’a pas pu être enregistrée." }, { status: 500 });
  if (!updated.length) return Response.json({ error: "Annonce introuvable." }, { status: 404 });
  return Response.json({ success: true });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const token = await tokenFrom(context);
  if (!token) return Response.json({ error: "Lien invalide." }, { status: 404 });
  const { url, headers } = getPrivateSupabaseConfig();
  const response = await fetch(
    `${url}/rest/v1/carpool_offers?management_token=eq.${token}`,
    { method: "DELETE", headers: { ...headers, Prefer: "return=representation" }, cache: "no-store" },
  );
  const deleted = response.ok ? await response.json() : [];
  if (!response.ok || !deleted.length) return Response.json({ error: "Annonce introuvable." }, { status: 404 });
  return Response.json({ success: true });
}
