import { getPrivateSupabaseConfig } from "@/lib/admin-data";
import {
  isAllowedCarpoolDate,
  parisLocalToInstant,
} from "@/lib/carpool-time";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SeatStatus = "free" | "reserved" | "validated";

type Seat = {
  id: string;
  offer_id: string;
  status: SeatStatus;
  request_id: string | null;
  passenger_name: string | null;
  passenger_contact: string | null;
  passenger_message: string | null;
};

function clean(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

async function offerIdFrom(context: { params: Promise<{ token: string }> }) {
  const { token: offerId } = await context.params;
  return UUID.test(offerId) ? offerId : "";
}

function nextSeatStatus(status: SeatStatus): SeatStatus {
  if (status === "free") return "reserved";
  if (status === "reserved") return "validated";
  return "free";
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const offerId = await offerIdFrom(context);
  if (!offerId) return Response.json({ error: "Annonce invalide." }, { status: 404 });

  const { url, headers } = getPrivateSupabaseConfig();
  const response = await fetch(
    `${url}/rest/v1/carpool_offers?id=eq.${offerId}&select=id,driver_name,direction,other_place,departure_local,seats_available,seats_total,contact,details,created_at,carpool_seats(id,position,status,passenger_name,passenger_contact,passenger_message,updated_at)&carpool_seats.order=position.asc`,
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
  const offerId = await offerIdFrom(context);
  if (!offerId) return Response.json({ error: "Annonce invalide." }, { status: 404 });
  const body = (await request.json()) as Record<string, unknown>;
  const { url, headers } = getPrivateSupabaseConfig();

  if (body.action === "cycle-seat") {
    const seatId = clean(body.seatId, 36);
    if (!UUID.test(seatId)) {
      return Response.json({ error: "Place invalide." }, { status: 400 });
    }

    const seatResponse = await fetch(
      `${url}/rest/v1/carpool_seats?id=eq.${seatId}&offer_id=eq.${offerId}&select=id,offer_id,status,request_id,passenger_name,passenger_contact,passenger_message`,
      { headers, cache: "no-store" },
    );
    const [seat] = seatResponse.ok ? (await seatResponse.json()) as Seat[] : [];
    if (!seat) return Response.json({ error: "Place introuvable." }, { status: 404 });

    const nextStatus = nextSeatStatus(seat.status);
    const seatUpdate = nextStatus === "free"
      ? {
          status: nextStatus,
          request_id: null,
          passenger_name: null,
          passenger_contact: null,
          passenger_message: null,
          updated_at: new Date().toISOString(),
        }
      : {
          status: nextStatus,
          passenger_name: seat.passenger_name || "Réservation manuelle",
          updated_at: new Date().toISOString(),
        };

    const updateResponse = await fetch(
      `${url}/rest/v1/carpool_seats?id=eq.${seatId}&offer_id=eq.${offerId}`,
      {
        method: "PATCH",
        headers: {
          ...headers,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify(seatUpdate),
        cache: "no-store",
      },
    );
    const [updatedSeat] = updateResponse.ok ? await updateResponse.json() : [];
    if (!updatedSeat) {
      return Response.json(
        { error: "Cette place n’a pas pu être modifiée." },
        { status: 409 },
      );
    }

    if (seat.request_id) {
      await fetch(`${url}/rest/v1/carpool_requests?id=eq.${seat.request_id}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          status: nextStatus === "validated" ? "validated" : "cancelled",
        }),
        cache: "no-store",
      });
    }

    const freeSeatsResponse = await fetch(
      `${url}/rest/v1/carpool_seats?offer_id=eq.${offerId}&status=eq.free&select=id`,
      { headers, cache: "no-store" },
    );
    const freeSeats = freeSeatsResponse.ok ? await freeSeatsResponse.json() : [];
    await fetch(`${url}/rest/v1/carpool_offers?id=eq.${offerId}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ seats_available: freeSeats.length }),
      cache: "no-store",
    });

    return Response.json({ seat: updatedSeat });
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
    return Response.json(
      { error: "Vérifiez les informations du trajet." },
      { status: 400 },
    );
  }

  const response = await fetch(
    `${url}/rest/v1/carpool_offers?id=eq.${offerId}`,
    {
      method: "PATCH",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
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
  if (!response.ok) {
    return Response.json(
      { error: "L’annonce n’a pas pu être enregistrée." },
      { status: 500 },
    );
  }
  if (!updated.length) {
    return Response.json({ error: "Annonce introuvable." }, { status: 404 });
  }
  return Response.json({ success: true });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const offerId = await offerIdFrom(context);
  if (!offerId) return Response.json({ error: "Annonce invalide." }, { status: 404 });
  const { url, headers } = getPrivateSupabaseConfig();
  const response = await fetch(
    `${url}/rest/v1/carpool_offers?id=eq.${offerId}`,
    {
      method: "DELETE",
      headers: { ...headers, Prefer: "return=representation" },
      cache: "no-store",
    },
  );
  const deleted = response.ok ? await response.json() : [];
  if (!response.ok || !deleted.length) {
    return Response.json({ error: "Annonce introuvable." }, { status: 404 });
  }
  return Response.json({ success: true });
}
