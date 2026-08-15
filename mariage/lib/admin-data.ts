import "server-only";

export type WeddingResponse = {
  id: string;
  respondent_name: string;
  respondent_email: string;
  companions: string[];
  attendance_days: string[];
  not_attending: boolean;
  departure_city: string | null;
  departure_country: string | null;
  friday_sleepers: number;
  saturday_sleepers: number;
  roommate_wishes: string | null;
  songs: string[];
  phone: string | null;
  lodging_guest_names: string[];
  lodging_nights: string[];
  lodging_payment_method: "wero" | "bank_transfer" | "later";
  lodging_reservation_id: string | null;
  created_at: string;
  updated_at: string;
};

export function getPrivateSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "La consultation privée n’est pas encore reliée à Supabase.",
    );
  }

  return {
    url,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  };
}

export type CarpoolOffer = {
  id: string;
  driver_name: string;
  direction: "to_massacan" | "from_massacan";
  other_place: string;
  departure_at: string;
  departure_local?: string;
  seats_available: number;
  seats_total?: number;
  driver_email?: string | null;
  contact: string;
  details: string | null;
  created_at: string;
};

export type CarpoolRequest = {
  id: string;
  offer_id: string;
  passenger_name: string;
  passenger_contact: string;
  seats_requested: number;
  message: string | null;
  status?: "reserved" | "validated" | "cancelled";
  created_at: string;
};

export type CarpoolSeat = {
  id: string;
  offer_id: string;
  position: number;
  status: "free" | "reserved" | "validated";
  request_id: string | null;
  passenger_name: string | null;
  passenger_contact: string | null;
  passenger_message: string | null;
  updated_at: string;
};

export async function getWeddingResponses() {
  const { url, headers } = getPrivateSupabaseConfig();
  const response = await fetch(
    `${url}/rest/v1/wedding_responses?select=id,respondent_name,respondent_email,companions,attendance_days,not_attending,departure_city,departure_country,friday_sleepers,saturday_sleepers,roommate_wishes,songs,phone,lodging_guest_names,lodging_nights,lodging_payment_method,lodging_reservation_id,created_at,updated_at&order=created_at.desc`,
    {
      headers,
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error("Les réponses ne peuvent pas être chargées actuellement.");
  }

  return (await response.json()) as WeddingResponse[];
}

export async function deleteWeddingResponse(id: string) {
  const { url, headers } = getPrivateSupabaseConfig();
  const response = await fetch(
    `${url}/rest/v1/wedding_responses?id=eq.${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      headers: {
        ...headers,
        Prefer: "return=minimal",
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error("La réponse n’a pas pu être supprimée.");
  }
}

export async function getCarpoolOffers() {
  const { url, headers } = getPrivateSupabaseConfig();
  const response = await fetch(
    `${url}/rest/v1/carpool_offers?select=id,driver_name,driver_email,direction,other_place,departure_at,departure_local,seats_available,seats_total,contact,details,created_at&order=departure_local.asc`,
    {
      headers,
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const error = await response.text();
    if (error.includes("departure_local") || error.includes("driver_email")) {
      const legacy = await fetch(
        `${url}/rest/v1/carpool_offers?select=id,driver_name,direction,other_place,departure_at,seats_available,contact,details,created_at&order=departure_at.asc`,
        { headers, cache: "no-store" },
      );
      if (legacy.ok) return (await legacy.json()) as CarpoolOffer[];
    }
    if (error.includes("carpool_offers") || error.includes("PGRST205")) {
      return [];
    }
    throw new Error(
      "Les propositions de covoiturage ne peuvent pas être chargées.",
    );
  }

  return (await response.json()) as CarpoolOffer[];
}

export async function deleteCarpoolOffer(id: string) {
  const { url, headers } = getPrivateSupabaseConfig();
  const response = await fetch(
    `${url}/rest/v1/carpool_offers?id=eq.${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      headers: {
        ...headers,
        Prefer: "return=minimal",
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error("Le trajet n’a pas pu être supprimé.");
  }
}

export async function getCarpoolRequests() {
  const { url, headers } = getPrivateSupabaseConfig();
  const response = await fetch(
    `${url}/rest/v1/carpool_requests?select=id,offer_id,passenger_name,passenger_contact,seats_requested,message,status,created_at&order=created_at.desc`,
    {
      headers,
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const error = await response.text();
    if (error.includes("status")) {
      const legacy = await fetch(
        `${url}/rest/v1/carpool_requests?select=id,offer_id,passenger_name,passenger_contact,seats_requested,message,created_at&order=created_at.desc`,
        { headers, cache: "no-store" },
      );
      if (legacy.ok) return (await legacy.json()) as CarpoolRequest[];
    }
    if (error.includes("carpool_requests") || error.includes("PGRST205")) {
      return [];
    }
    throw new Error("Les demandes de place ne peuvent pas être chargées.");
  }

  return (await response.json()) as CarpoolRequest[];
}

export async function getCarpoolSeats() {
  const { url, headers } = getPrivateSupabaseConfig();
  const response = await fetch(
    `${url}/rest/v1/carpool_seats?select=*&order=offer_id.asc,position.asc`,
    { headers, cache: "no-store" },
  );
  if (!response.ok) {
    const error = await response.text();
    if (error.includes("carpool_seats") || error.includes("PGRST205")) return [];
    throw new Error("Les places de covoiturage ne peuvent pas être chargées.");
  }
  return (await response.json()) as CarpoolSeat[];
}
