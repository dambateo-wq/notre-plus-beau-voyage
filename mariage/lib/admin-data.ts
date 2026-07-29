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

export async function getWeddingResponses() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "La consultation privée n’est pas encore reliée à Supabase.",
    );
  }

  const response = await fetch(
    `${url}/rest/v1/wedding_responses?select=id,respondent_name,companions,attendance_days,not_attending,departure_city,departure_country,friday_sleepers,saturday_sleepers,roommate_wishes,songs,created_at&order=created_at.desc`,
    {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error("Les réponses ne peuvent pas être chargées actuellement.");
  }

  return (await response.json()) as WeddingResponse[];
}
