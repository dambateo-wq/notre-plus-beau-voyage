import {
  getPrivateSupabaseConfig,
} from "@/lib/admin-data";
import { sendCarpoolManagementEmail } from "@/lib/carpool-email";
import { isAllowedCarpoolDate, legacyUtcClockToLocal } from "@/lib/carpool-time";

export const dynamic = "force-dynamic";

type CarpoolRequest = {
  driverName?: unknown;
  driverEmail?: unknown;
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

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function GET() {
  try {
    const { url, headers } = getPrivateSupabaseConfig();
    const response = await fetch(
      `${url}/rest/v1/carpool_offers?select=id,driver_name,direction,other_place,departure_at,departure_local,seats_available,seats_total,details,created_at,carpool_seats(id,position,status)&order=departure_local.asc&carpool_seats.order=position.asc`,
      {
        headers,
        cache: "no-store",
      },
    );

    if (response.ok) return Response.json(await response.json());

    const error = await response.text();
    if (error.includes("departure_local") || error.includes("carpool_seats")) {
      const legacyResponse = await fetch(
        `${url}/rest/v1/carpool_offers?select=id,driver_name,direction,other_place,departure_at,seats_available,details,created_at&order=departure_at.asc`,
        { headers, cache: "no-store" },
      );
      if (!legacyResponse.ok) throw new Error("Unable to load carpool offers");
      const legacy = (await legacyResponse.json()) as Array<Record<string, unknown>>;
      return Response.json(
        legacy.map((offer) => ({
          ...offer,
          departure_local: legacyUtcClockToLocal(String(offer.departure_at)),
          seats_total: offer.seats_available,
          carpool_seats: Array.from(
            { length: Number(offer.seats_available) },
            (_, index) => ({ id: `${offer.id}-${index + 1}`, position: index + 1, status: "free" }),
          ),
        })),
      );
    }
    throw new Error("Unable to load carpool offers");
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
    const driverEmail = cleanString(body.driverEmail, 120).toLowerCase();
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
      !isEmail(driverEmail) ||
      !contact ||
      !["to_massacan", "from_massacan"].includes(direction) ||
      !isAllowedCarpoolDate(departureAt) ||
      !Number.isInteger(seatsAvailable) ||
      seatsAvailable < 1 ||
      seatsAvailable > 8
    ) {
      return Response.json(
        { error: "Vérifiez les informations obligatoires du trajet." },
        { status: 400 },
      );
    }

    const managementToken = crypto.randomUUID();

    const { url, headers } = getPrivateSupabaseConfig();
    const response = await fetch(
      `${url}/rest/v1/rpc/create_carpool_offer`,
      {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          p_driver_name: driverName,
          p_driver_email: driverEmail,
          p_direction: direction,
          p_other_place: otherPlace,
          p_departure_local: departureAt.replace("T", " ") + ":00",
          p_seats_total: seatsAvailable,
          p_contact: contact,
          p_details: details,
          p_management_token: managementToken,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const [created] = (await response.json()) as Array<Record<string, unknown>>;
    const offer = {
      id: created.id,
      driver_name: created.driver_name,
      direction: created.direction,
      other_place: created.other_place,
      departure_at: created.departure_at,
      departure_local: created.departure_local,
      seats_available: created.seats_available,
      seats_total: created.seats_total,
      details: created.details,
      created_at: created.created_at,
      carpool_seats: Array.from({ length: seatsAvailable }, (_, index) => ({
        id: `${created.id}-${index + 1}`,
        position: index + 1,
        status: "free",
      })),
    };
    const origin = new URL(request.url).origin;
    const manageUrl = `${origin}/carpool/manage/${managementToken}`;
    const journey = direction === "to_massacan"
      ? `${otherPlace} → Domaine de Massacan`
      : `Domaine de Massacan → ${otherPlace}`;
    let emailSent = false;
    try {
      emailSent = await sendCarpoolManagementEmail({
        driverName, email: driverEmail, manageUrl, journey,
      });
    } catch {
      emailSent = false;
    }
    return Response.json({ offer, manageUrl, emailSent }, { status: 201 });
  } catch (caught) {
    console.error("carpool.create", caught);
    return Response.json(
      { error: "Le trajet n’a pas pu être publié. Vérifiez que la migration covoiturage a bien été appliquée." },
      { status: 500 },
    );
  }
}
