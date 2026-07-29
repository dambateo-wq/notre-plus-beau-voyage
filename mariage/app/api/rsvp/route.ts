import { getSupabaseConfig } from "@/lib/supabase";

type WeddingResponse = {
  respondentName?: unknown;
  companions?: unknown;
  attendanceDays?: unknown;
  notAttending?: unknown;
  departureCity?: unknown;
  departureCountry?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  fridaySleepers?: unknown;
  saturdaySleepers?: unknown;
  roommateWishes?: unknown;
  songs?: unknown;
};

const allowedDays = new Set(["2027-05-28", "2027-05-29", "2027-05-30"]);

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

function cleanCount(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 20 ? number : 0;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as WeddingResponse;
    const respondentName = cleanString(body.respondentName, 80);
    const notAttending = body.notAttending === true;
    const attendanceDays = cleanStringArray(body.attendanceDays, 3, 10).filter(
      (day) => allowedDays.has(day),
    );

    if (!respondentName) {
      return Response.json(
        { error: "Le nom et le prénom sont obligatoires." },
        { status: 400 },
      );
    }

    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    const departureCity = cleanString(body.departureCity, 120);
    const departureCountry = cleanString(body.departureCountry, 80);

    if (
      !notAttending &&
      (!attendanceDays.length ||
        !departureCity ||
        !departureCountry ||
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude))
    ) {
      return Response.json(
        { error: "Choisissez vos dates et votre ville de départ." },
        { status: 400 },
      );
    }

    const payload = {
      respondent_name: respondentName,
      companions: cleanStringArray(body.companions, 15, 80),
      attendance_days: notAttending ? [] : attendanceDays,
      not_attending: notAttending,
      departure_city: notAttending ? null : departureCity,
      departure_country: notAttending ? null : departureCountry,
      latitude: notAttending ? null : latitude,
      longitude: notAttending ? null : longitude,
      friday_sleepers: notAttending ? 0 : cleanCount(body.fridaySleepers),
      saturday_sleepers: notAttending ? 0 : cleanCount(body.saturdaySleepers),
      roommate_wishes: notAttending
        ? null
        : cleanString(body.roommateWishes, 300) || null,
      songs: notAttending ? [] : cleanStringArray(body.songs, 10, 120),
    };

    const { url, headers } = getSupabaseConfig();
    const response = await fetch(`${url}/rest/v1/wedding_responses`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    return Response.json({ success: true }, { status: 201 });
  } catch {
    return Response.json(
      { error: "La réponse n’a pas pu être enregistrée. Réessayez." },
      { status: 500 },
    );
  }
}
