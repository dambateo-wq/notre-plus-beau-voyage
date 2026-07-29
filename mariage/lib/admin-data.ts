import "server-only";

export type WeddingResponse = {
  id: string;
  respondent_name: string;
  companions: string[];
  attendance_days: string[];
  not_attending: boolean;
  departure_city: string | null;
  departure_country: string | null;
  friday_sleepers: number;
  saturday_sleepers: number;
  roommate_wishes: string | null;
  songs: string[];
  created_at: string;
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
  seats_available: number;
  contact: string;
  details: string | null;
  created_at: string;
};

export async function getWeddingResponses() {
  const { url, headers } = getPrivateSupabaseConfig();
  const response = await fetch(
    `${url}/rest/v1/wedding_responses?select=id,respondent_name,companions,attendance_days,not_attending,departure_city,departure_country,friday_sleepers,saturday_sleepers,roommate_wishes,songs,created_at&order=created_at.desc`,
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
    `${url}/rest/v1/carpool_offers?select=id,driver_name,direction,other_place,departure_at,seats_available,contact,details,created_at&order=departure_at.asc`,
    {
      headers,
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const error = await response.text();
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
