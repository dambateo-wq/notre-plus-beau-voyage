import {
  isAllowedCarpoolDate,
  legacyUtcClockToLocal,
} from "@/lib/carpool-time";

export type PublicCarpoolSeat = {
  id: string;
  position: number;
  status: "free" | "reserved" | "validated";
};

export type PublicCarpoolOffer = {
  id: string;
  driver_name: string;
  direction: "to_massacan" | "from_massacan";
  other_place: string;
  departure_at: string;
  departure_local: string;
  seats_available: number;
  seats_total: number;
  details: string | null;
  created_at: string;
  carpool_seats: PublicCarpoolSeat[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number) {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, number));
}

function localDateTime(offer: Record<string, unknown>) {
  const fromPostgrest = stringValue(offer.departure_local).replace(" ", "T");
  if (isAllowedCarpoolDate(fromPostgrest)) return fromPostgrest;

  const fromLegacyColumn = legacyUtcClockToLocal(stringValue(offer.departure_at));
  return isAllowedCarpoolDate(fromLegacyColumn) ? fromLegacyColumn : "";
}

function normalizeSeats(
  offerId: string,
  seatsValue: unknown,
  seatsTotal: number,
  seatsAvailable: number,
): PublicCarpoolSeat[] {
  const seatsByPosition = new Map<number, PublicCarpoolSeat>();

  if (Array.isArray(seatsValue)) {
    for (const rawSeat of seatsValue) {
      if (!isRecord(rawSeat)) continue;
      const position = boundedInteger(rawSeat.position, 0, 0, 8);
      const status = rawSeat.status;
      if (
        position < 1 ||
        position > seatsTotal ||
        !["free", "reserved", "validated"].includes(String(status))
      ) {
        continue;
      }
      seatsByPosition.set(position, {
        id: stringValue(rawSeat.id) || `${offerId}-${position}`,
        position,
        status: status as PublicCarpoolSeat["status"],
      });
    }
  }

  const occupiedFallback = seatsTotal - seatsAvailable;
  return Array.from({ length: seatsTotal }, (_, index) => {
    const position = index + 1;
    return (
      seatsByPosition.get(position) ?? {
        id: `${offerId}-${position}`,
        position,
        status: position <= occupiedFallback ? "reserved" as const : "free" as const,
      }
    );
  });
}

function normalizeOffer(value: unknown): PublicCarpoolOffer | null {
  if (!isRecord(value)) return null;

  const id = stringValue(value.id);
  const driverName = stringValue(value.driver_name);
  const otherPlace = stringValue(value.other_place);
  const departureAt = stringValue(value.departure_at);
  const departureLocal = localDateTime(value);
  const direction = value.direction;

  if (
    !id ||
    !driverName ||
    !otherPlace ||
    !departureAt ||
    !departureLocal ||
    !["to_massacan", "from_massacan"].includes(String(direction))
  ) {
    return null;
  }

  const rawSeats = Array.isArray(value.carpool_seats)
    ? value.carpool_seats
    : [];
  const availableCandidate = boundedInteger(value.seats_available, 0, 0, 8);
  const totalFallback = Math.max(availableCandidate, rawSeats.length, 1);
  const seatsTotal = boundedInteger(value.seats_total, totalFallback, 1, 8);
  const seatsAvailable = boundedInteger(
    value.seats_available,
    seatsTotal,
    0,
    seatsTotal,
  );

  return {
    id,
    driver_name: driverName,
    direction: direction as PublicCarpoolOffer["direction"],
    other_place: otherPlace,
    departure_at: departureAt,
    departure_local: departureLocal,
    seats_available: seatsAvailable,
    seats_total: seatsTotal,
    details: typeof value.details === "string" ? value.details : null,
    created_at: stringValue(value.created_at),
    carpool_seats: normalizeSeats(
      id,
      rawSeats,
      seatsTotal,
      seatsAvailable,
    ),
  };
}

export function normalizePublicCarpoolOffers(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map(normalizeOffer)
    .filter((offer): offer is PublicCarpoolOffer => offer !== null)
    .sort((first, second) =>
      first.departure_local.localeCompare(second.departure_local),
    );
}
