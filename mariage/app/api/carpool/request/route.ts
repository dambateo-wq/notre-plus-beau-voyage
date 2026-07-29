import { getPrivateSupabaseConfig } from "@/lib/admin-data";

type SeatRequest = {
  offerId?: unknown;
  passengerName?: unknown;
  passengerContact?: unknown;
  seatsRequested?: unknown;
  message?: unknown;
  website?: unknown;
};

function cleanString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SeatRequest;
    const offerId = cleanString(body.offerId, 36);
    const passengerName = cleanString(body.passengerName, 80);
    const passengerContact = cleanString(body.passengerContact, 120);
    const message = cleanString(body.message, 300);
    const seatsRequested = Number(body.seatsRequested);

    if (cleanString(body.website, 120)) {
      return Response.json({ success: true }, { status: 201 });
    }

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        offerId,
      ) ||
      !passengerName ||
      !passengerContact ||
      !Number.isInteger(seatsRequested) ||
      seatsRequested < 1 ||
      seatsRequested > 8
    ) {
      return Response.json(
        { error: "Vérifiez les informations de votre demande." },
        { status: 400 },
      );
    }

    const { url, headers } = getPrivateSupabaseConfig();
    const offerResponse = await fetch(
      `${url}/rest/v1/carpool_offers?id=eq.${encodeURIComponent(offerId)}&select=seats_available,contact`,
      { headers, cache: "no-store" },
    );
    const [offer] = offerResponse.ok ? await offerResponse.json() : [];

    if (!offer || seatsRequested > Number(offer.seats_available)) {
      return Response.json(
        { error: "Ce trajet n’a plus assez de places disponibles." },
        { status: 409 },
      );
    }

    const response = await fetch(`${url}/rest/v1/carpool_requests`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        offer_id: offerId,
        passenger_name: passengerName,
        passenger_contact: passengerContact,
        seats_requested: seatsRequested,
        message: message || null,
      }),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    return Response.json(
      { success: true, driverContact: offer.contact },
      { status: 201 },
    );
  } catch {
    return Response.json(
      { error: "La demande n’a pas pu être envoyée. Réessayez." },
      { status: 500 },
    );
  }
}
