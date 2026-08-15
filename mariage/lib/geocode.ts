export type NominatimResult = {
  display_name: string;
  name?: string;
  lat: string;
  lon: string;
  type?: string;
  addresstype?: string;
  class?: string;
  category?: string;
  importance?: number;
  place_rank?: number;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    country?: string;
    country_code?: string;
  };
};

export type GeocodedPlace = {
  label: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
};

type PlaceKind = "city" | "town" | "village" | "municipality";

const placeKindPriority: Record<PlaceKind, number> = {
  city: 400,
  town: 380,
  municipality: 360,
  village: 340,
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function asPlaceKind(value?: string): PlaceKind | null {
  const normalized = value?.toLocaleLowerCase("en");
  return normalized && normalized in placeKindPriority
    ? (normalized as PlaceKind)
    : null;
}

function getPlaceKind(place: NominatimResult): PlaceKind | null {
  const addressType = asPlaceKind(place.addresstype);
  if (addressType) return addressType;

  const type = asPlaceKind(place.type);
  if (type) return type;

  const placeClass = (place.category ?? place.class ?? "").toLocaleLowerCase("en");
  if (placeClass !== "boundary" || place.type?.toLocaleLowerCase("en") !== "administrative") {
    return null;
  }

  const address = place.address ?? {};
  if (address.city) return "city";
  if (address.town) return "town";
  if (address.municipality) return "municipality";
  if (address.village) return "village";
  return null;
}

function getCity(place: NominatimResult, kind: PlaceKind) {
  const address = place.address ?? {};
  const values = {
    city: address.city,
    town: address.town,
    village: address.village,
    municipality: address.municipality,
  };

  return (
    values[kind] ??
    address.city ??
    address.town ??
    address.municipality ??
    address.village ??
    place.name ??
    place.display_name.split(",")[0]
  )?.trim();
}

function scorePlace(place: NominatimResult, kind: PlaceKind, city: string, query: string) {
  const requestedCity = normalize(query.split(",")[0] ?? query);
  const requestedCountry = normalize(query.split(",").slice(1).join(" "));
  const cityName = normalize(city);
  const countryName = normalize(place.address?.country ?? "");
  const placeClass = (place.category ?? place.class ?? "").toLocaleLowerCase("en");
  let score = placeKindPriority[kind];

  if (cityName === requestedCity) score += 300;
  else if (cityName.startsWith(requestedCity) || requestedCity.startsWith(cityName)) score += 80;

  if (requestedCountry && countryName === requestedCountry) score += 60;
  if (asPlaceKind(place.addresstype) === kind) score += 45;
  if (asPlaceKind(place.type) === kind) score += 35;
  if (placeClass === "place") score += 25;
  if (placeClass === "boundary" && place.type?.toLocaleLowerCase("en") === "administrative") score += 20;
  score += Math.max(0, Math.min(1, place.importance ?? 0)) * 50;

  return score;
}

export function rankNominatimPlaces(
  results: NominatimResult[],
  query: string,
  limit = 5,
): GeocodedPlace[] {
  const candidates = results.flatMap((place) => {
    const kind = getPlaceKind(place);
    if (!kind) return [];

    const city = getCity(place, kind);
    const country = place.address?.country?.trim();
    const latitude = Number(place.lat);
    const longitude = Number(place.lon);
    if (
      !city ||
      !country ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return [];
    }

    return [{
      place: {
        label: place.display_name,
        city,
        country,
        latitude,
        longitude,
      },
      score: scorePlace(place, kind, city, query),
    }];
  });

  const deduplicated = new Map<string, (typeof candidates)[number]>();
  for (const candidate of candidates.sort((left, right) => right.score - left.score)) {
    const key = `${normalize(candidate.place.city)}|${normalize(candidate.place.country)}`;
    if (!deduplicated.has(key)) deduplicated.set(key, candidate);
  }

  return [...deduplicated.values()].slice(0, limit).map(({ place }) => place);
}
