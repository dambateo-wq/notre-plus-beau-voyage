import type { NextRequest } from "next/server";
import { rankNominatimPlaces, type NominatimResult } from "@/lib/geocode";

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
  search.searchParams.set("limit", "15");
  search.searchParams.set("dedupe", "1");
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
    const places = rankNominatimPlaces(data, query);

    return Response.json({ places });
  } catch {
    return Response.json(
      { error: "La recherche de ville est momentanément indisponible." },
      { status: 502 },
    );
  }
}
