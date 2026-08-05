import { getPrivateSupabaseConfig } from "@/lib/admin-data";
import {
  getPaymentDetails,
  updateLodgingReservation,
  type LodgingReservation,
} from "@/lib/lodging";

type ManageRequest = {
  action?: unknown;
  reference?: unknown;
  phone?: unknown;
  paymentMethod?: unknown;
};

function cleanString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "").replace(/^33/, "0");
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

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ManageRequest;
    const action = cleanString(body.action, 30);
    const reference = cleanString(body.reference, 20).toUpperCase();
    const phone = cleanString(body.phone, 30);

    if (!/^NPBV-[A-F0-9]{8}$/.test(reference) || phone.length < 8) {
      return Response.json(
        { error: "La référence ou le numéro de téléphone est incorrect." },
        { status: 400 },
      );
    }

    const { url, headers } = getPrivateSupabaseConfig();
    const response = await fetch(
      `${url}/rest/v1/lodging_reservations?reference=eq.${encodeURIComponent(reference)}&select=*`,
      { headers, cache: "no-store" },
    );
    const [reservation] = response.ok
      ? ((await response.json()) as LodgingReservation[])
      : [];

    if (
      !reservation ||
      normalizePhone(reservation.phone) !== normalizePhone(phone)
    ) {
      return Response.json(
        { error: "Aucune réservation ne correspond à ces informations." },
        { status: 404 },
      );
    }

    if (action === "declare_payment") {
      const paymentMethod = cleanString(body.paymentMethod, 20);
      if (!["wero", "bank_transfer"].includes(paymentMethod)) {
        return Response.json(
          { error: "Choisissez Wero ou le virement bancaire." },
          { status: 400 },
        );
      }
      if (reservation.booking_status !== "active") {
        return Response.json(
          { error: "Cette réservation a été annulée." },
          { status: 409 },
        );
      }

      await updateLodgingReservation(reservation.id, {
        payment_method: paymentMethod as "wero" | "bank_transfer",
        payment_status: "declared",
      });
      reservation.payment_method = paymentMethod as
        | "wero"
        | "bank_transfer";
      reservation.payment_status = "declared";
    } else if (action !== "lookup") {
      return Response.json({ error: "Action incorrecte." }, { status: 400 });
    }

    return Response.json({
      reservation: publicReservation(reservation),
      paymentDetails: getPaymentDetails(),
    });
  } catch {
    return Response.json(
      { error: "La réservation ne peut pas être consultée actuellement." },
      { status: 500 },
    );
  }
}
