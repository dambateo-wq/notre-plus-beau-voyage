import type { NextRequest } from "next/server";

type NominatimResult = {
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    state?: string;
    country?: string;
  };
};

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (query.length < 3 || query.length > 160) {
    return Response.json(
      { error: "Indiquez une ville et un pays." },
      { status: 400 },
    );
  }

  const search = new URL("https://nominatim.openstreetmap.org/search");
  search.searchParams.set("format", "jsonv2");
  search.searchParams.set("addressdetails", "1");
  search.searchParams.set("limit", "5");
  search.searchParams.set("accept-language", "fr");
  search.searchParams.set("q", query);

  try {
    const response = await fetch(search, {
      headers: {
        "User-Agent":
          "notre-plus-beau-voyage/1.0 (https://les-dadjus-notre-plus-beau-voyage.vercel.app)",
      },
      next: { revalidate: 86400 },
    });

    if (!response.ok) {
      throw new Error("Geocoding unavailable");
    }

    const data = (await response.json()) as NominatimResult[];
    const places = data.map((place) => {
      const address = place.address ?? {};
      const city =
        address.city ??
        address.town ??
        address.village ??
        address.municipality ??
        address.county ??
        address.state ??
        place.display_name.split(",")[0];

      return {
        label: place.display_name,
        city,
        country: address.country ?? "",
        latitude: Number(place.lat),
        longitude: Number(place.lon),
      };
    });

    return Response.json({ places });
  } catch {
    return Response.json(
      { error: "La recherche de ville est momentanément indisponible." },
      { status: 502 },
    );
  }
}
