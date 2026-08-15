import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { getPrivateSupabaseConfig } from "@/lib/admin-data";
import {
  LODGING_CAPACITY,
  LODGING_NIGHTS,
  LODGING_PRICE_CENTS,
  type LodgingChangeRequest,
  type LodgingReservation,
  type LodgingSnapshot,
} from "@/lib/lodging";
import { updateLodgingReservation } from "@/lib/lodging";

const ALLOWED_DAYS = new Set(["2027-05-28", "2027-05-29", "2027-05-30"]);
const PAYMENT_METHODS = new Set(["wero", "bank_transfer", "later"]);

export type RegistrationInput = {
  respondentName: string;
  respondentEmail: string;
  companions: string[];
  attendanceDays: string[];
  notAttending: boolean;
  departureCity: string;
  departureCountry: string;
  latitude: number | null;
  longitude: number | null;
  phone: string;
  lodgingGuestNames: string[];
  lodgingNights: string[];
  roommateWishes: string;
  paymentMethod: "wero" | "bank_transfer" | "later";
  songs: string[];
};

export type RegistrationRecord = {
  id: string;
  respondent_name: string;
  respondent_email: string;
  companions: string[];
  attendance_days: string[];
  not_attending: boolean;
  departure_city: string | null;
  departure_country: string | null;
  latitude: number | null;
  longitude: number | null;
  friday_sleepers: number;
  saturday_sleepers: number;
  roommate_wishes: string | null;
  songs: string[];
  phone: string | null;
  lodging_guest_names: string[];
  lodging_nights: string[];
  lodging_payment_method: "wero" | "bank_transfer" | "later";
  lodging_reservation_id: string | null;
  management_token_hash: string | null;
  created_at: string;
  updated_at: string;
};

export type ManagedRegistration = {
  registration: RegistrationInput & { id: string };
  reservation: null | {
    reference: string;
    amountCents: number;
    paymentStatus: LodgingReservation["payment_status"];
    bookingStatus: LodgingReservation["booking_status"];
    financialReviewStatus: "none" | "pending";
    previousAmountCents: number | null;
    proposedAmountCents: number | null;
  };
  pendingChange: LodgingChangeRequest | null;
};

export class RegistrationValidationError extends Error {}

function cleanString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanStringArray(value: unknown, maxItems: number, maxLength: number) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanString(item, maxLength)).filter(Boolean).slice(0, maxItems);
}

export function validateRegistrationInput(value: unknown): RegistrationInput {
  const body = (value ?? {}) as Record<string, unknown>;
  const respondentName = cleanString(body.respondentName, 80);
  const respondentEmail = cleanString(body.respondentEmail, 120).toLowerCase();
  const companions = cleanStringArray(body.companions, 15, 80);
  const notAttending = body.notAttending === true;
  const attendanceDays = cleanStringArray(body.attendanceDays, 3, 10).filter((day) => ALLOWED_DAYS.has(day));
  const departureCity = cleanString(body.departureCity, 120);
  const departureCountry = cleanString(body.departureCountry, 80);
  const latitudeValue = Number(body.latitude);
  const longitudeValue = Number(body.longitude);
  const latitude = Number.isFinite(latitudeValue) ? latitudeValue : null;
  const longitude = Number.isFinite(longitudeValue) ? longitudeValue : null;
  const phone = cleanString(body.phone, 30);
  const lodgingGuestNames = notAttending ? [] : cleanStringArray(body.lodgingGuestNames, 20, 80);
  const lodgingNights = notAttending
    ? []
    : cleanStringArray(body.lodgingNights, 2, 10).filter((night) =>
        LODGING_NIGHTS.includes(night as (typeof LODGING_NIGHTS)[number]),
      );
  const roommateWishes = cleanString(body.roommateWishes, 500);
  const requestedMethod = cleanString(body.paymentMethod, 20);
  const paymentMethod = (PAYMENT_METHODS.has(requestedMethod) ? requestedMethod : "later") as RegistrationInput["paymentMethod"];
  const songs = notAttending ? [] : cleanStringArray(body.songs, 10, 120);

  if (!respondentName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(respondentEmail)) {
    throw new RegistrationValidationError("Le nom, le prénom et une adresse e-mail valide sont obligatoires.");
  }
  if (!notAttending && (!attendanceDays.length || !departureCity || !departureCountry || latitude === null || longitude === null)) {
    throw new RegistrationValidationError("Choisissez vos dates et votre ville de départ.");
  }
  if (lodgingNights.length > 0 && (lodgingGuestNames.length < 1 || phone.replace(/\D/g, "").length < 8)) {
    throw new RegistrationValidationError("Choisissez les personnes hébergées et indiquez un numéro de téléphone valide.");
  }
  if ((lodgingGuestNames.length > 0) !== (lodgingNights.length > 0)) {
    throw new RegistrationValidationError("Choisissez au moins une personne et une nuit pour l’hébergement.");
  }

  const knownGuests = new Set([respondentName, ...companions].map((name) => name.toLocaleLowerCase("fr")));
  if (lodgingGuestNames.some((name) => !knownGuests.has(name.toLocaleLowerCase("fr")))) {
    throw new RegistrationValidationError("Les personnes hébergées doivent faire partie de votre groupe.");
  }

  return {
    respondentName,
    respondentEmail,
    companions,
    attendanceDays: notAttending ? [] : attendanceDays,
    notAttending,
    departureCity: notAttending ? "" : departureCity,
    departureCountry: notAttending ? "" : departureCountry,
    latitude: notAttending ? null : latitude,
    longitude: notAttending ? null : longitude,
    phone: lodgingNights.length ? phone : "",
    lodgingGuestNames,
    lodgingNights,
    roommateWishes: lodgingNights.length ? roommateWishes : "",
    paymentMethod,
    songs,
  };
}

export function createManagementToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashManagementToken(token) };
}

export function hashManagementToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function isManagementToken(value: string) {
  return /^[A-Za-z0-9_-]{43}$/.test(value);
}

function isLodgingAccessToken(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function lodgingAmount(input: Pick<RegistrationInput, "lodgingGuestNames" | "lodgingNights">) {
  return input.lodgingGuestNames.length * input.lodgingNights.length * LODGING_PRICE_CENTS;
}

export function registrationRow(input: RegistrationInput, tokenHash?: string) {
  const guests = input.lodgingGuestNames.length;
  return {
    respondent_name: input.respondentName,
    respondent_email: input.respondentEmail,
    companions: input.companions,
    attendance_days: input.attendanceDays,
    not_attending: input.notAttending,
    departure_city: input.notAttending ? null : input.departureCity,
    departure_country: input.notAttending ? null : input.departureCountry,
    latitude: input.notAttending ? null : input.latitude,
    longitude: input.notAttending ? null : input.longitude,
    friday_sleepers: input.lodgingNights.includes("2027-05-28") ? guests : 0,
    saturday_sleepers: input.lodgingNights.includes("2027-05-29") ? guests : 0,
    roommate_wishes: input.roommateWishes || null,
    songs: input.songs,
    phone: input.phone || null,
    lodging_guest_names: input.lodgingGuestNames,
    lodging_nights: input.lodgingNights,
    lodging_payment_method: input.paymentMethod,
    ...(tokenHash ? { management_token_hash: tokenHash } : {}),
    updated_at: new Date().toISOString(),
  };
}

export function recordToInput(record: RegistrationRecord): RegistrationInput {
  return {
    respondentName: record.respondent_name,
    respondentEmail: record.respondent_email,
    companions: record.companions ?? [],
    attendanceDays: record.attendance_days ?? [],
    notAttending: record.not_attending,
    departureCity: record.departure_city ?? "",
    departureCountry: record.departure_country ?? "",
    latitude: record.latitude,
    longitude: record.longitude,
    phone: record.phone ?? "",
    lodgingGuestNames: record.lodging_guest_names ?? [],
    lodgingNights: record.lodging_nights ?? [],
    roommateWishes: record.roommate_wishes ?? "",
    paymentMethod: record.lodging_payment_method ?? "later",
    songs: record.songs ?? [],
  };
}

export function lodgingSnapshot(input: RegistrationInput): LodgingSnapshot {
  return {
    guestNames: input.lodgingGuestNames,
    guestsCount: input.lodgingGuestNames.length,
    nights: input.lodgingNights,
    amountCents: lodgingAmount(input),
    roommateWishes: input.roommateWishes,
    paymentMethod: input.paymentMethod,
  };
}

export function reservationSnapshot(reservation: LodgingReservation): LodgingSnapshot {
  return {
    guestNames: reservation.guest_names,
    guestsCount: reservation.guests_count,
    nights: reservation.nights,
    amountCents: reservation.amount_cents,
    roommateWishes: reservation.roommate_wishes ?? "",
    paymentMethod: reservation.payment_method,
  };
}

export async function insertRegistration(input: RegistrationInput, tokenHash: string) {
  const { url, headers } = getPrivateSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/wedding_responses?select=*`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(registrationRow(input, tokenHash)),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await response.text());
  const [record] = (await response.json()) as RegistrationRecord[];
  if (!record) throw new Error("Réponse Supabase inattendue.");
  return record;
}

export async function patchRegistration(id: string, input: RegistrationInput) {
  const { url, headers } = getPrivateSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/wedding_responses?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(registrationRow(input)),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await response.text());
}

export async function linkRegistrationToReservation(responseId: string, reservationId: string) {
  const { url, headers } = getPrivateSupabaseConfig();
  const [responseLink, reservationLink] = await Promise.all([
    fetch(`${url}/rest/v1/wedding_responses?id=eq.${encodeURIComponent(responseId)}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ lodging_reservation_id: reservationId, updated_at: new Date().toISOString() }),
    }),
    fetch(`${url}/rest/v1/lodging_reservations?id=eq.${encodeURIComponent(reservationId)}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ wedding_response_id: responseId, updated_at: new Date().toISOString() }),
    }),
  ]);
  if (!responseLink.ok || !reservationLink.ok) throw new Error("Le lien entre inscription et hébergement n’a pas pu être créé.");
}

export async function createLinkedLodging(responseId: string, input: RegistrationInput) {
  const reference = `NPBV-${randomBytes(4).toString("hex").toUpperCase()}`;
  const { url, headers } = getPrivateSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/rpc/create_lodging_reservation`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      p_reference: reference,
      p_access_token: randomUUID(),
      p_booker_name: input.respondentName,
      p_phone: input.phone,
      p_email: input.respondentEmail,
      p_guest_names: input.lodgingGuestNames,
      p_guests_count: input.lodgingGuestNames.length,
      p_nights: input.lodgingNights,
      p_roommate_wishes: input.roommateWishes,
      p_payment_method: input.paymentMethod,
    }),
    cache: "no-store",
  });
  if (!response.ok) {
    const error = await response.text();
    if (error.includes("NIGHT_FULL")) throw new RegistrationValidationError("Il ne reste plus assez de couchages pour cette nuit.");
    throw new Error(error);
  }
  const [reservation] = (await response.json()) as LodgingReservation[];
  if (!reservation) throw new Error("Réservation Supabase inattendue.");
  try {
    await linkRegistrationToReservation(responseId, reservation.id);
  } catch (caught) {
    await fetch(`${url}/rest/v1/lodging_reservations?id=eq.${encodeURIComponent(reservation.id)}`, {
      method: "DELETE",
      headers: { ...headers, Prefer: "return=minimal" },
      cache: "no-store",
    });
    throw caught;
  }
  reservation.wedding_response_id = responseId;
  return reservation;
}

export async function getRegistrationByToken(token: string): Promise<ManagedRegistration | null> {
  const record = await getRegistrationRecordByToken(token);
  if (!record) return null;
  const { url, headers } = getPrivateSupabaseConfig();

  let reservation: LodgingReservation | null = null;
  let pendingChange: LodgingChangeRequest | null = null;
  if (record.lodging_reservation_id) {
    const [reservationResponse, changeResponse] = await Promise.all([
      fetch(`${url}/rest/v1/lodging_reservations?id=eq.${encodeURIComponent(record.lodging_reservation_id)}&select=*`, { headers, cache: "no-store" }),
      fetch(`${url}/rest/v1/lodging_change_requests?reservation_id=eq.${encodeURIComponent(record.lodging_reservation_id)}&status=eq.pending&select=*&order=created_at.desc&limit=1`, { headers, cache: "no-store" }),
    ]);
    if (reservationResponse.ok) [reservation] = (await reservationResponse.json()) as LodgingReservation[];
    if (changeResponse.ok) [pendingChange] = (await changeResponse.json()) as LodgingChangeRequest[];
  }

  return {
    registration: { id: record.id, ...recordToInput(record) },
    reservation: reservation
      ? {
          reference: reservation.reference,
          amountCents: reservation.amount_cents,
          paymentStatus: reservation.payment_status,
          bookingStatus: reservation.booking_status,
          financialReviewStatus: reservation.financial_review_status ?? "none",
          previousAmountCents: reservation.previous_amount_cents ?? null,
          proposedAmountCents: reservation.proposed_amount_cents ?? null,
        }
      : null,
    pendingChange,
  };
}

export async function assertLodgingCapacity(nights: string[], guestsCount: number, excludeReservationId?: string) {
  if (!nights.length || !guestsCount) return;
  const { url, headers } = getPrivateSupabaseConfig();
  const response = await fetch(
    `${url}/rest/v1/lodging_reservations?booking_status=eq.active&select=id,guests_count,nights`,
    { headers, cache: "no-store" },
  );
  if (!response.ok) throw new Error("Les disponibilités ne peuvent pas être vérifiées.");
  const reservations = (await response.json()) as Array<{ id: string; guests_count: number; nights: string[] }>;
  for (const night of nights) {
    const reserved = reservations
      .filter((item) => item.id !== excludeReservationId && item.nights.includes(night))
      .reduce((sum, item) => sum + item.guests_count, 0);
    if (reserved + guestsCount > LODGING_CAPACITY) {
      throw new RegistrationValidationError("Il ne reste plus assez de couchages pour cette nuit.");
    }
  }
}

export async function replaceLodgingDetails(reservationId: string, input: RegistrationInput) {
  await assertLodgingCapacity(input.lodgingNights, input.lodgingGuestNames.length, reservationId);
  const { url, headers } = getPrivateSupabaseConfig();
  const amount = lodgingAmount(input);
  const response = await fetch(`${url}/rest/v1/lodging_reservations?id=eq.${encodeURIComponent(reservationId)}`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({
      booker_name: input.respondentName,
      phone: input.phone,
      email: input.respondentEmail,
      guest_names: input.lodgingGuestNames,
      guests_count: input.lodgingGuestNames.length,
      nights: input.lodgingNights,
      amount_cents: amount,
      roommate_wishes: input.roommateWishes || null,
      payment_method: input.paymentMethod,
      booking_status: amount > 0 ? "active" : "cancelled",
      updated_at: new Date().toISOString(),
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await response.text());
}

export async function clearLodgingPlacements(reservationId: string) {
  const { url, headers } = getPrivateSupabaseConfig();
  const responses = await Promise.all([
    fetch(`${url}/rest/v1/lodging_guest_assignments?reservation_id=eq.${encodeURIComponent(reservationId)}`, {
      method: "DELETE",
      headers: { ...headers, Prefer: "return=minimal" },
      cache: "no-store",
    }),
    fetch(`${url}/rest/v1/lodging_assignments?reservation_id=eq.${encodeURIComponent(reservationId)}`, {
      method: "DELETE",
      headers: { ...headers, Prefer: "return=minimal" },
      cache: "no-store",
    }),
  ]);
  if (responses.some((response) => !response.ok)) throw new Error("Les anciens placements n’ont pas pu être réinitialisés.");
}

export async function createFinancialChange(
  record: RegistrationRecord,
  reservation: LodgingReservation,
  input: RegistrationInput,
) {
  const { url, headers } = getPrivateSupabaseConfig();
  const oldDetails = reservationSnapshot(reservation);
  const newDetails = lodgingSnapshot(input);

  await fetch(`${url}/rest/v1/lodging_change_requests?reservation_id=eq.${encodeURIComponent(reservation.id)}&status=eq.pending`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ status: "superseded", decision_at: new Date().toISOString() }),
    cache: "no-store",
  });

  const changeResponse = await fetch(`${url}/rest/v1/lodging_change_requests?select=*`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({
      wedding_response_id: record.id,
      reservation_id: reservation.id,
      old_amount_cents: oldDetails.amountCents,
      new_amount_cents: newDetails.amountCents,
      difference_cents: newDetails.amountCents - oldDetails.amountCents,
      old_details: oldDetails,
      new_details: newDetails,
    }),
    cache: "no-store",
  });
  if (!changeResponse.ok) throw new Error(await changeResponse.text());
  const [change] = (await changeResponse.json()) as LodgingChangeRequest[];

  const reviewResponse = await fetch(`${url}/rest/v1/lodging_reservations?id=eq.${encodeURIComponent(reservation.id)}`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({
      financial_review_status: "pending",
      previous_amount_cents: oldDetails.amountCents,
      proposed_amount_cents: newDetails.amountCents,
      updated_at: new Date().toISOString(),
    }),
    cache: "no-store",
  });
  if (!reviewResponse.ok) throw new Error(await reviewResponse.text());

  const difference = newDetails.amountCents - oldDetails.amountCents;
  await fetch(`${url}/rest/v1/admin_notifications`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({
      notification_type: "lodging_financial_change",
      message: `${record.respondent_name} a modifié son hébergement (${difference >= 0 ? "+" : ""}${(difference / 100).toFixed(2)} €).`,
      wedding_response_id: record.id,
      lodging_change_request_id: change.id,
    }),
    cache: "no-store",
  });
  return change;
}

export async function getRegistrationRecordByToken(token: string) {
  const { url, headers } = getPrivateSupabaseConfig();
  if (isManagementToken(token)) {
    const response = await fetch(
      `${url}/rest/v1/wedding_responses?management_token_hash=eq.${hashManagementToken(token)}&select=*`,
      { headers, cache: "no-store" },
    );
    if (!response.ok) throw new Error("L’inscription ne peut pas être chargée.");
    const [record] = (await response.json()) as RegistrationRecord[];
    return record ?? null;
  }

  if (!isLodgingAccessToken(token)) return null;
  const reservationResponse = await fetch(
    `${url}/rest/v1/lodging_reservations?access_token=eq.${encodeURIComponent(token)}&select=wedding_response_id&limit=1`,
    { headers, cache: "no-store" },
  );
  if (!reservationResponse.ok) throw new Error("L’inscription ne peut pas être chargée.");
  const [reservation] = (await reservationResponse.json()) as Array<{
    wedding_response_id: string | null;
  }>;
  if (!reservation?.wedding_response_id) return null;

  const response = await fetch(
    `${url}/rest/v1/wedding_responses?id=eq.${encodeURIComponent(reservation.wedding_response_id)}&select=*`,
    { headers, cache: "no-store" },
  );
  if (!response.ok) throw new Error("L’inscription ne peut pas être chargée.");
  const [record] = (await response.json()) as RegistrationRecord[];
  return record ?? null;
}

export async function getLinkedReservation(record: RegistrationRecord) {
  if (!record.lodging_reservation_id) return null;
  const { url, headers } = getPrivateSupabaseConfig();
  const response = await fetch(
    `${url}/rest/v1/lodging_reservations?id=eq.${encodeURIComponent(record.lodging_reservation_id)}&select=*`,
    { headers, cache: "no-store" },
  );
  if (!response.ok) throw new Error("La réservation ne peut pas être chargée.");
  const [reservation] = (await response.json()) as LodgingReservation[];
  return reservation ?? null;
}

export async function deleteRegistration(id: string) {
  const { url, headers } = getPrivateSupabaseConfig();
  await fetch(`${url}/rest/v1/wedding_responses?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { ...headers, Prefer: "return=minimal" },
    cache: "no-store",
  });
}

export async function reviewLodgingChange(changeId: string, decision: "approved" | "refused") {
  const { url, headers } = getPrivateSupabaseConfig();
  const changeResponse = await fetch(
    `${url}/rest/v1/lodging_change_requests?id=eq.${encodeURIComponent(changeId)}&status=eq.pending&select=*`,
    { headers, cache: "no-store" },
  );
  if (!changeResponse.ok) throw new Error("La demande ne peut pas être chargée.");
  const [change] = (await changeResponse.json()) as LodgingChangeRequest[];
  if (!change) throw new Error("Cette demande a déjà été traitée.");

  const [recordResponse, reservationResponse] = await Promise.all([
    fetch(`${url}/rest/v1/wedding_responses?id=eq.${encodeURIComponent(change.wedding_response_id)}&select=*`, { headers, cache: "no-store" }),
    fetch(`${url}/rest/v1/lodging_reservations?id=eq.${encodeURIComponent(change.reservation_id)}&select=*`, { headers, cache: "no-store" }),
  ]);
  const [record] = recordResponse.ok ? (await recordResponse.json()) as RegistrationRecord[] : [];
  const [reservation] = reservationResponse.ok ? (await reservationResponse.json()) as LodgingReservation[] : [];
  if (!record || !reservation) throw new Error("L’inscription associée est introuvable.");

  const details = decision === "approved" ? change.new_details : change.old_details;
  const restoredInput: RegistrationInput = {
    ...recordToInput(record),
    lodgingGuestNames: details.guestNames,
    lodgingNights: details.nights,
    roommateWishes: details.roommateWishes,
    paymentMethod: details.paymentMethod,
    phone: details.amountCents > 0 ? record.phone ?? reservation.phone : "",
  };

  if (decision === "approved") {
    if (details.amountCents > 0) {
      await replaceLodgingDetails(reservation.id, restoredInput);
      await updateLodgingReservation(reservation.id, { booking_status: "active", placement_status: "pending" });
    } else {
      await updateLodgingReservation(reservation.id, { booking_status: "cancelled", placement_status: "pending" });
    }
    await clearLodgingPlacements(reservation.id);
  } else {
    await patchRegistration(record.id, restoredInput);
  }

  const [historyResponse, reservationReviewResponse] = await Promise.all([
    fetch(`${url}/rest/v1/lodging_change_requests?id=eq.${encodeURIComponent(change.id)}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ status: decision, decision_at: new Date().toISOString() }),
      cache: "no-store",
    }),
    fetch(`${url}/rest/v1/lodging_reservations?id=eq.${encodeURIComponent(reservation.id)}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ financial_review_status: "none", previous_amount_cents: null, proposed_amount_cents: null, updated_at: new Date().toISOString() }),
      cache: "no-store",
    }),
    fetch(`${url}/rest/v1/admin_notifications?lodging_change_request_id=eq.${encodeURIComponent(change.id)}&read_at=is.null`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ read_at: new Date().toISOString() }),
      cache: "no-store",
    }),
  ]);
  if (!historyResponse.ok || !reservationReviewResponse.ok) {
    throw new Error("La décision n’a pas pu être finalisée.");
  }
}
