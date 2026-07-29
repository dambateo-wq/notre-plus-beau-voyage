import {
  type CarpoolOffer,
  getPrivateSupabaseConfig,
} from "@/lib/admin-data";

export const dynamic = "force-dynamic";

type CarpoolRequest = {
  driverName?: unknown;
  direction?: unknown;
  otherPlace?: unknown;
  departureAt?: unknown;
  seatsAvailable?: unknown;
  contact?: unknown;
  details?: unknown;
  website?: unknown;
};

function cleanString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function isAllowedDate(value: string) {
  const date = new Date(value);
  const earliest = new Date("2027-05-25T00:00:00+02:00");
  const latest = new Date("2027-06-02T23:59:59+02:00");
  return (
    Number.isFinite(date.getTime()) && date >= earliest && date <= latest
  );
}

export async function GET() {
  try {
    const { url, headers } = getPrivateSupabaseConfig();
    const response = await fetch(
      `${url}/rest/v1/carpool_offers?select=id,driver_name,direction,other_place,departure_at,seats_available,details,created_at&order=departure_at.asc`,
      {
        headers,
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error("Unable to load carpool offers");
    }

    return Response.json(await response.json());
  } catch {
    return Response.json(
      { error: "Les trajets sont momentanément indisponibles." },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CarpoolRequest;
    const driverName = cleanString(body.driverName, 80);
    const direction = cleanString(body.direction, 20);
    const otherPlace = cleanString(body.otherPlace, 140);
    const departureAt = cleanString(body.departureAt, 40);
    const contact = cleanString(body.contact, 120);
    const details = cleanString(body.details, 500);
    const seatsAvailable = Number(body.seatsAvailable);

    if (cleanString(body.website, 120)) {
      return Response.json({ success: true }, { status: 201 });
    }

    if (
      !driverName ||
      !otherPlace ||
      !contact ||
      !["to_massacan", "from_massacan"].includes(direction) ||
      !isAllowedDate(departureAt) ||
      !Number.isInteger(seatsAvailable) ||
      seatsAvailable < 1 ||
      seatsAvailable > 8
    ) {
      return Response.json(
        { error: "Vérifiez les informations obligatoires du trajet." },
        { status: 400 },
      );
    }

    const payload = {
      driver_name: driverName,
      direction,
      other_place: otherPlace,
      departure_at: new Date(departureAt).toISOString(),
      seats_available: seatsAvailable,
      contact,
      details: details || null,
    };

    const { url, headers } = getPrivateSupabaseConfig();
    const response = await fetch(
      `${url}/rest/v1/carpool_offers?select=id,driver_name,direction,other_place,departure_at,seats_available,details,created_at`,
      {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const [offer] = (await response.json()) as CarpoolOffer[];
    return Response.json({ offer }, { status: 201 });
  } catch {
    return Response.json(
      { error: "Le trajet n’a pas pu être publié. Réessayez." },
      { status: 500 },
    );
  }
}
