import { randomBytes, randomUUID } from "node:crypto";
import { getPrivateSupabaseConfig } from "@/lib/admin-data";
import {
  getPaymentDetails,
  LODGING_CAPACITY,
  LODGING_NIGHTS,
  LODGING_PRICE_CENTS,
  type LodgingReservation,
} from "@/lib/lodging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReservationRequest = {
  bookerName?: unknown;
  phone?: unknown;
  email?: unknown;
  guestNames?: unknown;
  guestsCount?: unknown;
  nights?: unknown;
  roommateWishes?: unknown;
  paymentMethod?: unknown;
  website?: unknown;
};

function cleanString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanStringArray(value: unknown, maxItems: number, maxLength: number) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanString(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function publicReservation(reservation: LodgingReservation) {
  return {
    reference: reservation.reference,
    bookerName: reservation.booker_name,
    guestNames: reservation.guest_names,
    guestsCount: reservation.guests_count,
    nights: reservation.nights,
    amountCents: reservation.amount_cents,
    paymentMethod: reservation.payment_method,
    paymentStatus: reservation.payment_status,
    bookingStatus: reservation.booking_status,
  };
}

export async function GET() {
  try {
    const { url, headers } = getPrivateSupabaseConfig();
    const response = await fetch(
      `${url}/rest/v1/lodging_reservations?select=guests_count,nights&booking_status=eq.active`,
      { headers, cache: "no-store" },
    );

    if (!response.ok) {
      throw new Error("Unable to load lodging availability");
    }

    const reservations = (await response.json()) as Array<{
      guests_count: number;
      nights: string[];
    }>;
    const availability = Object.fromEntries(
      LODGING_NIGHTS.map((night) => {
        const reserved = reservations
          .filter((reservation) => reservation.nights.includes(night))
          .reduce(
            (total, reservation) => total + reservation.guests_count,
            0,
          );
        return [night, Math.max(0, LODGING_CAPACITY - reserved)];
      }),
    );

    return Response.json({
      capacity: LODGING_CAPACITY,
      priceCents: LODGING_PRICE_CENTS,
      availability,
    });
  } catch {
    return Response.json(
      { error: "Les disponibilités sont momentanément indisponibles." },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ReservationRequest;
    if (cleanString(body.website, 120)) {
      return Response.json({ success: true }, { status: 201 });
    }

    const bookerName = cleanString(body.bookerName, 80);
    const phone = cleanString(body.phone, 30);
    const email = cleanString(body.email, 120);
    const guestsCount = Number(body.guestsCount);
    const guestNames = cleanStringArray(body.guestNames, 20, 80);
    const nights = cleanStringArray(body.nights, 2, 10).filter((night) =>
      LODGING_NIGHTS.includes(
        night as (typeof LODGING_NIGHTS)[number],
      ),
    );
    const roommateWishes = cleanString(body.roommateWishes, 500);
    const paymentMethod = cleanString(body.paymentMethod, 20);

    if (
      !bookerName ||
      phone.length < 8 ||
      !Number.isInteger(guestsCount) ||
      guestsCount < 1 ||
      guestsCount > 20 ||
      guestNames.length !== guestsCount ||
      nights.length < 1 ||
      !["wero", "bank_transfer", "later"].includes(paymentMethod)
    ) {
      return Response.json(
        { error: "Vérifiez les informations obligatoires de la réservation." },
        { status: 400 },
      );
    }

    const reference = `NPBV-${randomBytes(4).toString("hex").toUpperCase()}`;
    const { url, headers } = getPrivateSupabaseConfig();
    const response = await fetch(
      `${url}/rest/v1/rpc/create_lodging_reservation`,
      {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_reference: reference,
          p_access_token: randomUUID(),
          p_booker_name: bookerName,
          p_phone: phone,
          p_email: email,
          p_guest_names: guestNames,
          p_guests_count: guestsCount,
          p_nights: nights,
          p_roommate_wishes: roommateWishes,
          p_payment_method: paymentMethod,
        }),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      if (error.includes("NIGHT_FULL")) {
        return Response.json(
          { error: "Il ne reste plus assez de couchages pour cette nuit." },
          { status: 409 },
        );
      }
      throw new Error(error);
    }

    const [reservation] = (await response.json()) as LodgingReservation[];
    return Response.json(
      {
        success: true,
        reservation: publicReservation(reservation),
        paymentDetails: getPaymentDetails(),
      },
      { status: 201 },
    );
  } catch {
    return Response.json(
      { error: "La réservation n’a pas pu être enregistrée. Réessayez." },
      { status: 500 },
    );
  }
}
