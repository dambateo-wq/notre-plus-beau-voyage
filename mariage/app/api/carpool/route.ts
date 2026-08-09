import { getPrivateSupabaseConfig } from "@/lib/admin-data";
import { normalizePublicCarpoolOffers } from "@/lib/carpool-public";
import {
  isAllowedCarpoolDate,
  legacyUtcClockToLocal,
  parisLocalToInstant,
} from "@/lib/carpool-time";

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

export async function GET() {
  try {
    const { url, headers } = getPrivateSupabaseConfig();
    const offersResponse = await fetch(
      `${url}/rest/v1/carpool_offers?select=id,driver_name,direction,other_place,departure_at,departure_local,seats_available,seats_total,details,created_at&order=departure_local.asc`,
      {
        headers,
        cache: "no-store",
      },
    );

    if (!offersResponse.ok) {
      const legacyResponse = await fetch(
        `${url}/rest/v1/carpool_offers?select=id,driver_name,direction,other_place,departure_at,seats_available,details,created_at&order=departure_at.asc`,
        { headers, cache: "no-store" },
      );
      if (!legacyResponse.ok) throw new Error("Unable to load carpool offers");
      const legacy = await legacyResponse.json();
      const legacyOffers = Array.isArray(legacy)
        ? legacy.map((offer) => ({
          ...offer,
          departure_local: legacyUtcClockToLocal(String(offer?.departure_at)),
          seats_total: offer?.seats_available,
          carpool_seats: Array.from(
            { length: Number(offer?.seats_available) },
            (_, index) => ({ id: `${offer.id}-${index + 1}`, position: index + 1, status: "free" }),
          ),
        }))
        : [];
      return Response.json(normalizePublicCarpoolOffers(legacyOffers));
    }

    const offersPayload = await offersResponse.json();
    if (!Array.isArray(offersPayload)) {
      throw new Error("Unexpected carpool offers response");
    }

    // La relation imbriquée PostgREST dépend du cache de schéma. Une lecture
    // séparée évite qu'un cache incomplet ou une réponse RLS partielle renvoie
    // `carpool_seats: null` au composant React.
    const seatsResponse = await fetch(
      `${url}/rest/v1/carpool_seats?select=id,offer_id,position,status&order=offer_id.asc,position.asc`,
      { headers, cache: "no-store" },
    );
    const seatsPayload = seatsResponse.ok ? await seatsResponse.json() : [];
    const seatsByOffer = new Map<string, unknown[]>();
    if (Array.isArray(seatsPayload)) {
      for (const seat of seatsPayload) {
        if (!seat || typeof seat !== "object" || Array.isArray(seat)) continue;
        const offerId = String((seat as Record<string, unknown>).offer_id ?? "");
        if (!offerId) continue;
        seatsByOffer.set(offerId, [...(seatsByOffer.get(offerId) ?? []), seat]);
      }
    }

    return Response.json(
      normalizePublicCarpoolOffers(
        offersPayload.map((offer) => ({
          ...offer,
          carpool_seats:
            offer && typeof offer === "object" && !Array.isArray(offer)
              ? seatsByOffer.get(String((offer as Record<string, unknown>).id)) ?? []
              : [],
        })),
      ),
    );
  } catch (caught) {
    console.error("carpool.list", caught);
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

    const { url, headers } = getPrivateSupabaseConfig();
    const response = await fetch(
      `${url}/rest/v1/carpool_offers?select=id,driver_name,direction,other_place,departure_at,departure_local,seats_available,seats_total,details,created_at`,
      {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          driver_name: driverName,
          direction,
          other_place: otherPlace,
          departure_at: parisLocalToInstant(departureAt).toISOString(),
          departure_local: departureAt.replace("T", " ") + ":00",
          seats_available: seatsAvailable,
          seats_total: seatsAvailable,
          contact,
          details: details || null,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const createdPayload = await response.json();
    const [created] = Array.isArray(createdPayload) ? createdPayload : [];
    const [offer] = normalizePublicCarpoolOffers([{
      ...created,
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
    }]);
    if (!offer) throw new Error("Unexpected carpool offer response");
    return Response.json({ offer }, { status: 201 });
  } catch (caught) {
    console.error("carpool.create", caught);
    return Response.json(
      { error: "Le trajet n’a pas pu être publié. Vérifiez que la migration covoiturage a bien été appliquée." },
      { status: 500 },
    );
  }
}
