import "server-only";

import { getPrivateSupabaseConfig } from "@/lib/admin-data";

export const LODGING_NIGHTS = ["2027-05-28", "2027-05-29"] as const;
export const LODGING_CAPACITY = 90;
export const LODGING_PRICE_CENTS = 3500;

export type LodgingReservation = {
  id: string;
  reference: string;
  access_token: string;
  booker_name: string;
  phone: string;
  email: string | null;
  guest_names: string[];
  guests_count: number;
  nights: string[];
  amount_cents: number;
  roommate_wishes: string | null;
  payment_method: "wero" | "bank_transfer" | "later";
  payment_status: "unpaid" | "declared" | "confirmed";
  booking_status: "active" | "cancelled";
  created_at: string;
  updated_at: string;
};

export function getPaymentDetails() {
  const weroPhone = process.env.LODGING_WERO_PHONE;
  const iban = process.env.LODGING_IBAN;
  const bic = process.env.LODGING_BIC;
  const accountHolder = process.env.LODGING_ACCOUNT_HOLDER;

  return {
    weroPhone: weroPhone ?? "",
    iban: iban ?? "",
    bic: bic ?? "",
    accountHolder: accountHolder ?? "",
    configured: Boolean(weroPhone && iban && bic && accountHolder),
  };
}

export async function getLodgingReservations() {
  const { url, headers } = getPrivateSupabaseConfig();
  const response = await fetch(
    `${url}/rest/v1/lodging_reservations?select=*&order=created_at.desc`,
    { headers, cache: "no-store" },
  );

  if (!response.ok) {
    const error = await response.text();
    if (
      error.includes("lodging_reservations") ||
      error.includes("PGRST205")
    ) {
      return [];
    }
    throw new Error("Les réservations de nuitées ne peuvent pas être chargées.");
  }

  return (await response.json()) as LodgingReservation[];
}

export async function updateLodgingReservation(
  id: string,
  values: Partial<
    Pick<
      LodgingReservation,
      "payment_status" | "booking_status" | "payment_method"
    >
  >,
) {
  const { url, headers } = getPrivateSupabaseConfig();
  const response = await fetch(
    `${url}/rest/v1/lodging_reservations?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        ...values,
        updated_at: new Date().toISOString(),
      }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error("La réservation n’a pas pu être mise à jour.");
  }
}
