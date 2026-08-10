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
    const response = await fetch(`${url}/rest/v1/rpc/reserve_carpool_seats`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        p_offer_id: offerId,
        p_passenger_name: passengerName,
        p_passenger_contact: passengerContact,
        p_seats_requested: seatsRequested,
        p_message: message,
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      if (details.includes("NOT_ENOUGH_SEATS")) {
        return Response.json(
          { error: "Il ne reste plus assez de places libres sur ce trajet." },
          { status: 409 },
        );
      }
      throw new Error(details);
    }

    const resultPayload = await response.json();
    const [result] = (Array.isArray(resultPayload) ? resultPayload : []) as Array<{
      driver_contact: string;
      remaining_seats: number;
    }>;
    if (
      !result ||
      typeof result.driver_contact !== "string" ||
      !Number.isInteger(Number(result.remaining_seats))
    ) {
      throw new Error("Unexpected reserve_carpool_seats response");
    }

    return Response.json(
      {
        success: true,
        driverContact: result.driver_contact,
        remainingSeats: result.remaining_seats,
      },
      { status: 201 },
    );
  } catch (caught) {
    console.error("carpool.reserve", caught);
    return Response.json(
      { error: "La demande n’a pas pu être envoyée. Réessayez." },
      { status: 500 },
    );
  }
}
