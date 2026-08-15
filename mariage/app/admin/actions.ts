"use server";

import { randomUUID } from "node:crypto";
import {
  createAdminSession,
  deleteAdminSession,
  isAdminAuthenticated,
  isValidAdminPassword,
} from "@/lib/admin-auth";
import { deleteCarpoolOffer, deleteWeddingResponse, getWeddingResponses } from "@/lib/admin-data";
import {
  assertWeddingEmailHistoryAvailable,
  deliverGuestMessage,
  deliverPaymentReminder,
  getAttendingEmailRecipients,
  isPaymentReminderReservation,
  mapWithConcurrency,
  recordWeddingEmailDelivery,
} from "@/lib/admin-email";
import { deleteLodgingReservation, getLodgingAssignments, getLodgingGuestAssignments, getLodgingReservations, placeLodgingGuest as persistLodgingGuest, saveLodgingAssignment, unplaceLodgingGuest as removeLodgingGuest, updateLodgingReservation } from "@/lib/lodging";
import { getRoomCapacity, LODGING_ROOM_NAMES } from "@/lib/lodging-rooms";
import { reviewLodgingChange } from "@/lib/registration";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export type ManualEmailActionResult = {
  ok: boolean;
  sentCount: number;
  failedCount: number;
  failures: Array<{ recipient: string; error: string }>;
  warning?: string;
  error?: string;
};

const EMPTY_EMAIL_RESULT: ManualEmailActionResult = {
  ok: false,
  sentCount: 0,
  failedCount: 0,
  failures: [],
};

function errorMessage(caught: unknown) {
  return caught instanceof Error ? caught.message : "L’envoi n’a pas pu être effectué.";
}

async function siteOrigin() {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") || "https";
  if (!host) throw new Error("L’adresse du site ne peut pas être déterminée.");
  return `${protocol}://${host}`;
}

function sameReservationResponse(
  reservationId: string,
  weddingResponseId: string | null | undefined,
  response: Awaited<ReturnType<typeof getWeddingResponses>>[number],
) {
  return (
    response.id === weddingResponseId ||
    response.lodging_reservation_id === reservationId
  );
}

export async function sendManualPaymentReminders(
  reservationIds: string[],
): Promise<ManualEmailActionResult> {
  if (!(await isAdminAuthenticated())) {
    return { ...EMPTY_EMAIL_RESULT, error: "Votre session admin a expiré." };
  }

  try {
    await assertWeddingEmailHistoryAvailable();
    const uniqueIds = [...new Set(reservationIds)].filter((id) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id),
    );
    if (!uniqueIds.length) {
      return { ...EMPTY_EMAIL_RESULT, error: "Sélectionnez au moins une réservation." };
    }

    const [reservations, responses, origin] = await Promise.all([
      getLodgingReservations(),
      getWeddingResponses(),
      siteOrigin(),
    ]);
    const selected = reservations.filter(
      (reservation) =>
        uniqueIds.includes(reservation.id) &&
        isPaymentReminderReservation(reservation),
    );
    if (!selected.length) {
      return {
        ...EMPTY_EMAIL_RESULT,
        error: "Ces paiements ne sont plus à relancer.",
      };
    }

    const outcomes = await mapWithConcurrency(selected, 2, async (reservation) => {
      const response = responses.find((item) =>
        sameReservationResponse(
          reservation.id,
          reservation.wedding_response_id,
          item,
        ),
      );
      const recipient = (reservation.email || response?.respondent_email || "")
        .trim()
        .toLowerCase();
      let delivered:
        | Awaited<ReturnType<typeof deliverPaymentReminder>>
        | undefined;

      try {
        delivered = await deliverPaymentReminder(reservation, response, origin);
      } catch (caught) {
        const error = errorMessage(caught);
        try {
          await recordWeddingEmailDelivery({
            emailType: "manual_payment_reminder",
            reservationId: reservation.id,
            responseId: response?.id ?? reservation.wedding_response_id ?? null,
            recipientEmail: recipient || "adresse-invalide",
            recipientName: reservation.booker_name,
            subject: "Petit rappel pour votre hébergement — Damien & Julie",
            content: "Échec avant envoi du rappel d’hébergement.",
            status: "failed",
            errorMessage: error,
          });
        } catch {
          // L'erreur d'envoi reste prioritaire dans le compte rendu admin.
        }
        return { sent: false as const, recipient: recipient || reservation.booker_name, error };
      }

      let warning = "";
      try {
        await recordWeddingEmailDelivery({
          emailType: "manual_payment_reminder",
          reservationId: reservation.id,
          responseId: response?.id ?? reservation.wedding_response_id ?? null,
          recipientEmail: delivered.email,
          recipientName: reservation.booker_name,
          subject: delivered.subject,
          content: delivered.text,
          status: "sent",
        });
      } catch (caught) {
        warning = errorMessage(caught);
      }
      return { sent: true as const, recipient: delivered.email, warning };
    });

    revalidatePath("/admin");
    const failures = outcomes
      .filter((outcome): outcome is Extract<typeof outcome, { sent: false }> => !outcome.sent)
      .map(({ recipient, error }) => ({ recipient, error }));
    const warnings = outcomes
      .filter((outcome): outcome is Extract<typeof outcome, { sent: true }> => outcome.sent)
      .map((outcome) => outcome.warning)
      .filter(Boolean);
    return {
      ok: failures.length === 0,
      sentCount: outcomes.length - failures.length,
      failedCount: failures.length,
      failures,
      warning: warnings.length
        ? "Certains e-mails ont été envoyés, mais leur historique n’a pas pu être enregistré."
        : undefined,
    };
  } catch (caught) {
    return { ...EMPTY_EMAIL_RESULT, error: errorMessage(caught) };
  }
}

export async function sendManualGuestMessage(input: {
  recipientEmails: string[];
  subject: string;
  message: string;
}): Promise<ManualEmailActionResult> {
  if (!(await isAdminAuthenticated())) {
    return { ...EMPTY_EMAIL_RESULT, error: "Votre session admin a expiré." };
  }

  const subjectTemplate = input.subject.trim().slice(0, 160);
  const messageTemplate = input.message.trim().slice(0, 12000);
  if (!subjectTemplate || !messageTemplate) {
    return { ...EMPTY_EMAIL_RESULT, error: "L’objet et le message sont obligatoires." };
  }

  try {
    await assertWeddingEmailHistoryAvailable();
    const responses = await getWeddingResponses();
    const allowedRecipients = getAttendingEmailRecipients(responses);
    const requested = new Set(
      input.recipientEmails.map((email) => email.trim().toLowerCase()),
    );
    const recipients = allowedRecipients.filter((recipient) =>
      requested.has(recipient.email),
    );
    if (!recipients.length) {
      return { ...EMPTY_EMAIL_RESULT, error: "Sélectionnez au moins un destinataire." };
    }

    const campaignId = randomUUID();
    const outcomes = await mapWithConcurrency(recipients, 3, async (recipient) => {
      let delivered: Awaited<ReturnType<typeof deliverGuestMessage>> | undefined;
      try {
        delivered = await deliverGuestMessage(
          recipient,
          subjectTemplate,
          messageTemplate,
        );
      } catch (caught) {
        const error = errorMessage(caught);
        try {
          await recordWeddingEmailDelivery({
            emailType: "manual_guest_message",
            campaignId,
            responseId: recipient.responseId,
            recipientEmail: recipient.email,
            recipientName: recipient.name,
            subject: subjectTemplate,
            content: messageTemplate,
            status: "failed",
            errorMessage: error,
          });
        } catch {
          // L'erreur SMTP reste prioritaire dans le résultat présenté.
        }
        return { sent: false as const, recipient: recipient.email, error };
      }

      let warning = "";
      try {
        await recordWeddingEmailDelivery({
          emailType: "manual_guest_message",
          campaignId,
          responseId: recipient.responseId,
          recipientEmail: recipient.email,
          recipientName: recipient.name,
          subject: delivered.subject,
          content: delivered.content,
          status: "sent",
        });
      } catch (caught) {
        warning = errorMessage(caught);
      }
      return { sent: true as const, recipient: recipient.email, warning };
    });

    revalidatePath("/admin");
    const failures = outcomes
      .filter((outcome): outcome is Extract<typeof outcome, { sent: false }> => !outcome.sent)
      .map(({ recipient, error }) => ({ recipient, error }));
    const warnings = outcomes
      .filter((outcome): outcome is Extract<typeof outcome, { sent: true }> => outcome.sent)
      .map((outcome) => outcome.warning)
      .filter(Boolean);
    return {
      ok: failures.length === 0,
      sentCount: outcomes.length - failures.length,
      failedCount: failures.length,
      failures,
      warning: warnings.length
        ? "Certains e-mails ont été envoyés, mais leur historique n’a pas pu être enregistré."
        : undefined,
    };
  } catch (caught) {
    return { ...EMPTY_EMAIL_RESULT, error: errorMessage(caught) };
  }
}

export async function login(formData: FormData) {
  const password = String(formData.get("password") ?? "");

  if (!isValidAdminPassword(password)) {
    await new Promise((resolve) => setTimeout(resolve, 800));
    redirect("/admin?error=1");
  }

  await createAdminSession();
  redirect("/admin");
}

export async function logout() {
  await deleteAdminSession();
  redirect("/admin");
}

export async function deleteResponse(formData: FormData) {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin");
  }

  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("Cette réponse est invalide.");
  }

  await deleteWeddingResponse(id);
  revalidatePath("/admin");
}

export async function deleteCarpool(formData: FormData) {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin");
  }

  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("Ce trajet est invalide.");
  }

  await deleteCarpoolOffer(id);
  revalidatePath("/admin");
  revalidatePath("/");
}

export async function updateLodging(formData: FormData) {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin");
  }

  const id = String(formData.get("id") ?? "");
  const action = String(formData.get("action") ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("Cette réservation est invalide.");
  }

  if (action === "confirm") {
    await updateLodgingReservation(id, {
      payment_status: "confirmed",
      placement_status: "pending",
    });
  } else if (action === "cancel") {
    await updateLodgingReservation(id, { booking_status: "cancelled" });
  } else {
    throw new Error("Cette action est invalide.");
  }

  revalidatePath("/admin");
  revalidatePath("/");
}

export async function deleteLodging(formData: FormData) {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin");
  }

  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("Cette réservation est invalide.");
  }

  await deleteLodgingReservation(id);
  revalidatePath("/admin");
  revalidatePath("/");
}

export async function saveLodgingPlacement(formData: FormData) {
  if (!(await isAdminAuthenticated())) redirect("/admin");
  const id = String(formData.get("id") ?? "");
  const roomName = String(formData.get("roomName") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id) || !LODGING_ROOM_NAMES.includes(roomName as never)) {
    throw new Error("Le placement est invalide.");
  }
  const count = (name: string) => {
    const value = Number(formData.get(name) ?? 0);
    if (!Number.isInteger(value) || value < 0 || value > 20) throw new Error("Les effectifs sont invalides.");
    return value;
  };
  const values = {
    room_name: roomName,
    friday_adults: count("fridayAdults"), friday_children: count("fridayChildren"), friday_babies: count("fridayBabies"),
    saturday_adults: count("saturdayAdults"), saturday_children: count("saturdayChildren"), saturday_babies: count("saturdayBabies"),
  };
  const reservations = await getLodgingReservations();
  const reservation = reservations.find((item) => item.id === id);
  if (!reservation || reservation.booking_status !== "active" || reservation.payment_status !== "confirmed") {
    throw new Error("Seules les réservations actives dont le paiement est confirmé peuvent être placées.");
  }
  const fridayTotal = values.friday_adults + values.friday_children + values.friday_babies;
  const saturdayTotal = values.saturday_adults + values.saturday_children + values.saturday_babies;
  if ((reservation.nights.includes("2027-05-28") && fridayTotal !== reservation.guests_count) ||
      (reservation.nights.includes("2027-05-29") && saturdayTotal !== reservation.guests_count)) {
    throw new Error("Le total de chaque nuit doit correspondre au nombre de personnes réservées.");
  }
  const assignments = await getLodgingAssignments();
  const capacity = getRoomCapacity(roomName);
  const already = (night: "friday" | "saturday") => assignments
    .filter((item) => item.reservation_id !== id && item.room_name === roomName)
    .reduce((sum, item) => sum + (night === "friday" ? item.friday_adults + item.friday_children + item.friday_babies : item.saturday_adults + item.saturday_children + item.saturday_babies), 0);
  if (already("friday") + fridayTotal > capacity || already("saturday") + saturdayTotal > capacity) {
    throw new Error("Cette chambre n’a pas assez de places libres pour ce placement.");
  }
  await saveLodgingAssignment(id, values);
  revalidatePath("/admin");
}

export async function saveGuestLodgingPlacement(formData: FormData) {
  if (!(await isAdminAuthenticated())) redirect("/admin");
  const reservationId = String(formData.get("reservationId") ?? "");
  const guestIndex = Number(formData.get("guestIndex"));
  const roomName = String(formData.get("roomName") ?? "");
  if (
    !/^[0-9a-f-]{36}$/i.test(reservationId) ||
    !Number.isInteger(guestIndex) || guestIndex < 1 || guestIndex > 20 ||
    !LODGING_ROOM_NAMES.includes(roomName as never)
  ) throw new Error("Le placement individuel est invalide.");

  await updateLodgingReservation(reservationId, { placement_status: "in_progress" });
  const assignment = await persistLodgingGuest(reservationId, guestIndex, roomName);
  revalidatePath("/admin");
  return assignment;
}

export async function removeGuestLodgingPlacement(formData: FormData) {
  if (!(await isAdminAuthenticated())) redirect("/admin");
  const reservationId = String(formData.get("reservationId") ?? "");
  const guestIndex = Number(formData.get("guestIndex"));
  if (!/^[0-9a-f-]{36}$/i.test(reservationId) || !Number.isInteger(guestIndex)) {
    throw new Error("Le placement individuel est invalide.");
  }
  await updateLodgingReservation(reservationId, { placement_status: "in_progress" });
  await removeLodgingGuest(reservationId, guestIndex);
  revalidatePath("/admin");
}

export async function finalizeLodgingPlacement(formData: FormData) {
  if (!(await isAdminAuthenticated())) redirect("/admin");
  const reservationId = String(formData.get("reservationId") ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reservationId)) {
    throw new Error("Cette réservation est invalide.");
  }

  const [reservations, assignments] = await Promise.all([
    getLodgingReservations(),
    getLodgingGuestAssignments(),
  ]);
  const reservation = reservations.find((item) => item.id === reservationId);
  if (
    !reservation ||
    reservation.booking_status !== "active" ||
    reservation.payment_status !== "confirmed"
  ) {
    throw new Error("Cette réservation ne peut pas être finalisée.");
  }

  const assignedIndexes = new Set(
    assignments
      .filter((assignment) => assignment.reservation_id === reservationId)
      .map((assignment) => assignment.guest_index),
  );
  const everyGuestIsPlaced = Array.from(
    { length: reservation.guests_count },
    (_, index) => index + 1,
  ).every((guestIndex) => assignedIndexes.has(guestIndex));
  if (!everyGuestIsPlaced || assignedIndexes.size !== reservation.guests_count) {
    throw new Error("Tous les voyageurs doivent être affectés avant de confirmer.");
  }

  await updateLodgingReservation(reservationId, { placement_status: "finalized" });
  revalidatePath("/admin");
}

export async function reopenLodgingPlacement(formData: FormData) {
  if (!(await isAdminAuthenticated())) redirect("/admin");
  const reservationId = String(formData.get("reservationId") ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reservationId)) {
    throw new Error("Cette réservation est invalide.");
  }

  const reservations = await getLodgingReservations();
  const reservation = reservations.find((item) => item.id === reservationId);
  if (
    !reservation ||
    reservation.booking_status !== "active" ||
    reservation.payment_status !== "confirmed"
  ) {
    throw new Error("Cette réservation ne peut pas être modifiée.");
  }

  await updateLodgingReservation(reservationId, { placement_status: "in_progress" });
  revalidatePath("/admin");
}

export async function reviewLodgingModification(formData: FormData) {
  if (!(await isAdminAuthenticated())) redirect("/admin");
  const changeId = String(formData.get("changeId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(changeId) ||
    !["approved", "refused"].includes(decision)
  ) {
    throw new Error("Cette décision est invalide.");
  }
  await reviewLodgingChange(changeId, decision as "approved" | "refused");
  revalidatePath("/admin");
  revalidatePath("/");
}
