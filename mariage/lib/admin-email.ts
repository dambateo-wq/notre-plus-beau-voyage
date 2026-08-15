import "server-only";

import type { WeddingResponse } from "@/lib/admin-data";
import { getPrivateSupabaseConfig } from "@/lib/admin-data";
import { emailFrame, escapeHtml, sendWeddingEmail } from "@/lib/email";
import {
  getPaymentDetails,
  type LodgingReservation,
} from "@/lib/lodging";

export type WeddingEmailHistoryEntry = {
  id: string;
  email_type: "manual_payment_reminder" | "manual_guest_message";
  campaign_id: string | null;
  lodging_reservation_id: string | null;
  wedding_response_id: string | null;
  recipient_email: string;
  recipient_name: string | null;
  subject: string;
  content: string;
  status: "sent" | "failed";
  error_message: string | null;
  created_at: string;
};

export type WeddingEmailHistory = {
  available: boolean;
  entries: WeddingEmailHistoryEntry[];
};

export type PaymentReminderCandidate = {
  reservationId: string;
  responseId: string | null;
  name: string;
  email: string;
  amountCents: number;
  lastReminderAt: string | null;
  reminderCount: number;
  canSend: boolean;
};

export type AttendingEmailRecipient = {
  responseId: string;
  name: string;
  email: string;
  days: string[];
};

export type CampaignSummary = {
  createdAt: string;
  subject: string;
  selectedCount: number;
  sentCount: number;
  failedCount: number;
} | null;

export type EmailDeliveryLogInput = {
  emailType: WeddingEmailHistoryEntry["email_type"];
  campaignId?: string | null;
  reservationId?: string | null;
  responseId?: string | null;
  recipientEmail: string;
  recipientName: string;
  subject: string;
  content: string;
  status: WeddingEmailHistoryEntry["status"];
  errorMessage?: string | null;
};

const DAY_LABELS: Record<string, string> = {
  "2027-05-28": "Vendredi 28 mai",
  "2027-05-29": "Samedi 29 mai",
  "2027-05-30": "Dimanche 30 mai",
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidWeddingEmail(value: string | null | undefined) {
  return Boolean(value && EMAIL_PATTERN.test(value.trim().toLowerCase()));
}

function missingHistoryTable(error: string) {
  return (
    error.includes("PGRST205") ||
    error.includes("wedding_email_history") ||
    error.includes("relation") && error.includes("does not exist")
  );
}

export async function getWeddingEmailHistory(): Promise<WeddingEmailHistory> {
  const { url, headers } = getPrivateSupabaseConfig();
  const response = await fetch(
    `${url}/rest/v1/wedding_email_history?select=*&order=created_at.desc`,
    { headers, cache: "no-store" },
  );

  if (!response.ok) {
    const error = await response.text();
    if (missingHistoryTable(error)) return { available: false, entries: [] };
    throw new Error("L’historique des e-mails ne peut pas être chargé.");
  }

  return {
    available: true,
    entries: (await response.json()) as WeddingEmailHistoryEntry[],
  };
}

export async function assertWeddingEmailHistoryAvailable() {
  const history = await getWeddingEmailHistory();
  if (!history.available) {
    throw new Error(
      "La migration Supabase des e-mails manuels doit être exécutée avant le premier envoi.",
    );
  }
}

export async function recordWeddingEmailDelivery(input: EmailDeliveryLogInput) {
  const { url, headers } = getPrivateSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/wedding_email_history`, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      email_type: input.emailType,
      campaign_id: input.campaignId ?? null,
      lodging_reservation_id: input.reservationId ?? null,
      wedding_response_id: input.responseId ?? null,
      recipient_email: input.recipientEmail,
      recipient_name: input.recipientName || null,
      subject: input.subject,
      content: input.content,
      status: input.status,
      error_message: input.errorMessage?.slice(0, 1000) ?? null,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("L’envoi a été traité, mais son historique n’a pas pu être enregistré.");
  }
}

function responseForReservation(
  reservation: LodgingReservation,
  responses: WeddingResponse[],
) {
  return responses.find(
    (response) =>
      response.id === reservation.wedding_response_id ||
      response.lodging_reservation_id === reservation.id,
  );
}

export function isPaymentReminderReservation(reservation: LodgingReservation) {
  return (
    reservation.booking_status === "active" &&
    reservation.payment_status !== "confirmed" &&
    reservation.amount_cents > 0 &&
    reservation.guests_count > 0 &&
    reservation.nights.length > 0
  );
}

export function getPaymentReminderCandidates(
  reservations: LodgingReservation[],
  responses: WeddingResponse[],
  history: WeddingEmailHistoryEntry[],
): PaymentReminderCandidate[] {
  return reservations.filter(isPaymentReminderReservation).map((reservation) => {
    const linkedResponse = responseForReservation(reservation, responses);
    const email = (reservation.email || linkedResponse?.respondent_email || "")
      .trim()
      .toLowerCase();
    const sentReminders = history.filter(
      (entry) =>
        entry.email_type === "manual_payment_reminder" &&
        entry.lodging_reservation_id === reservation.id &&
        entry.status === "sent",
    );

    return {
      reservationId: reservation.id,
      responseId: linkedResponse?.id ?? reservation.wedding_response_id ?? null,
      name: reservation.booker_name,
      email,
      amountCents: reservation.amount_cents,
      lastReminderAt: sentReminders[0]?.created_at ?? null,
      reminderCount: sentReminders.length,
      canSend: isValidWeddingEmail(email),
    };
  });
}

export function getAttendingEmailRecipients(
  responses: WeddingResponse[],
): AttendingEmailRecipient[] {
  const recipients = new Map<string, AttendingEmailRecipient>();

  for (const response of responses) {
    const email = response.respondent_email?.trim().toLowerCase();
    if (
      response.not_attending ||
      !response.attendance_days.length ||
      !isValidWeddingEmail(email) ||
      recipients.has(email)
    ) {
      continue;
    }
    recipients.set(email, {
      responseId: response.id,
      name: response.respondent_name,
      email,
      days: response.attendance_days,
    });
  }

  return [...recipients.values()];
}

export function getLastGuestCampaign(
  history: WeddingEmailHistoryEntry[],
): CampaignSummary {
  const latest = history.find(
    (entry) => entry.email_type === "manual_guest_message" && entry.campaign_id,
  );
  if (!latest?.campaign_id) return null;
  const deliveries = history.filter(
    (entry) => entry.campaign_id === latest.campaign_id,
  );
  return {
    createdAt: latest.created_at,
    subject: latest.subject,
    selectedCount: deliveries.length,
    sentCount: deliveries.filter((entry) => entry.status === "sent").length,
    failedCount: deliveries.filter((entry) => entry.status === "failed").length,
  };
}

function money(cents: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

function firstName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  if (
    parts.length > 1 &&
    parts[0] === parts[0].toLocaleUpperCase("fr") &&
    parts[1] !== parts[1].toLocaleUpperCase("fr")
  ) {
    return parts[1];
  }
  return parts[0];
}

function lastName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return "";
  if (
    parts[0] === parts[0].toLocaleUpperCase("fr") &&
    parts[1] !== parts[1].toLocaleUpperCase("fr")
  ) {
    return parts[0];
  }
  return parts.slice(1).join(" ");
}

export function personalizeGuestMessage(template: string, fullName: string) {
  return template
    .replaceAll("{{prenom}}", firstName(fullName) || fullName)
    .replaceAll("{{nom}}", lastName(fullName) || fullName);
}

function htmlLines(value: string) {
  return escapeHtml(value).replaceAll("\n", "<br>");
}

function paymentInstructionsHtml(reservation: LodgingReservation) {
  const payment = getPaymentDetails();
  const reference = escapeHtml(reservation.reference);

  if (reservation.payment_method === "wero") {
    if (!payment.weroPhone) throw new Error("Le numéro Wero n’est pas configuré.");
    return `<p style="line-height:1.7"><strong>Mode de règlement :</strong><br>Wero<br><br><strong>Numéro :</strong><br>${escapeHtml(payment.weroPhone)}<br><br><strong>Référence :</strong><br>${reference}</p><p style="line-height:1.6;color:#667064">Merci d’indiquer cette référence afin que nous puissions identifier facilement votre règlement.</p>`;
  }

  if (reservation.payment_method === "bank_transfer") {
    if (!payment.accountHolder || !payment.iban || !payment.bic) {
      throw new Error("Les coordonnées bancaires ne sont pas configurées.");
    }
    return `<p style="line-height:1.7"><strong>Mode de règlement :</strong><br>Virement bancaire<br><br><strong>Titulaire :</strong><br>${escapeHtml(payment.accountHolder)}<br><strong>IBAN :</strong><br>${escapeHtml(payment.iban)}<br><strong>BIC :</strong><br>${escapeHtml(payment.bic)}<br><br><strong>Référence :</strong><br>${reference}</p><p style="line-height:1.6;color:#667064">Merci d’indiquer cette référence dans le libellé du virement afin que nous puissions identifier facilement votre règlement.</p>`;
  }

  if (!payment.weroPhone || !payment.accountHolder || !payment.iban || !payment.bic) {
    throw new Error("Les moyens de règlement ne sont pas complètement configurés.");
  }
  return `<p style="line-height:1.7">Vous n’aviez pas encore choisi votre moyen de règlement.</p><p style="line-height:1.7"><strong>Wero :</strong><br>${escapeHtml(payment.weroPhone)}<br><br><strong>OU</strong><br><br><strong>Virement :</strong><br>Titulaire : ${escapeHtml(payment.accountHolder)}<br>IBAN : ${escapeHtml(payment.iban)}<br>BIC : ${escapeHtml(payment.bic)}<br><br><strong>Référence :</strong><br>${reference}</p>`;
}

function paymentInstructionsText(reservation: LodgingReservation) {
  const payment = getPaymentDetails();
  if (reservation.payment_method === "wero") {
    if (!payment.weroPhone) throw new Error("Le numéro Wero n’est pas configuré.");
    return `Mode de règlement : Wero\nNuméro : ${payment.weroPhone}\nRéférence : ${reservation.reference}\n\nMerci d’indiquer cette référence afin que nous puissions identifier facilement votre règlement.`;
  }
  if (reservation.payment_method === "bank_transfer") {
    if (!payment.accountHolder || !payment.iban || !payment.bic) {
      throw new Error("Les coordonnées bancaires ne sont pas configurées.");
    }
    return `Mode de règlement : Virement bancaire\nTitulaire : ${payment.accountHolder}\nIBAN : ${payment.iban}\nBIC : ${payment.bic}\nRéférence : ${reservation.reference}\n\nMerci d’indiquer cette référence dans le libellé du virement afin que nous puissions identifier facilement votre règlement.`;
  }
  if (!payment.weroPhone || !payment.accountHolder || !payment.iban || !payment.bic) {
    throw new Error("Les moyens de règlement ne sont pas complètement configurés.");
  }
  return `Vous n’aviez pas encore choisi votre moyen de règlement.\n\nWero :\n${payment.weroPhone}\n\nOU\n\nVirement :\nTitulaire : ${payment.accountHolder}\nIBAN : ${payment.iban}\nBIC : ${payment.bic}\n\nRéférence : ${reservation.reference}`;
}

export function buildPaymentReminder(
  reservation: LodgingReservation,
  response: WeddingResponse | undefined,
  siteOrigin: string,
) {
  const subject = "Petit rappel pour votre hébergement — Damien & Julie";
  const greetingName = firstName(reservation.booker_name) || reservation.booker_name;
  const guests = reservation.guest_names.length
    ? reservation.guest_names
    : response?.lodging_guest_names ?? [];
  const nights = reservation.nights.map((night) => DAY_LABELS[night] ?? night);
  const manageUrl = response
    ? `${siteOrigin.replace(/\/$/, "")}/inscription/manage/${reservation.access_token}`
    : null;
  const detailsText = [
    `Bonjour ${greetingName},`,
    "Petit rappel concernant votre hébergement au Domaine du Massacan pour notre mariage.",
    "VOTRE RÉSERVATION",
    `Personnes hébergées :\n${guests.map((guest) => `- ${guest}`).join("\n")}`,
    `Nuitée(s) réservée(s) :\n${nights.map((night) => `- ${night}`).join("\n")}`,
    `Nombre de personnes : ${reservation.guests_count}`,
    `Nombre de nuits : ${reservation.nights.length}`,
    `Montant total : ${money(reservation.amount_cents)}`,
    `Montant restant à régler : ${money(reservation.amount_cents)}`,
    paymentInstructionsText(reservation),
    manageUrl
      ? `Vous pouvez retrouver votre inscription, vérifier votre réservation ou modifier vos informations grâce à votre lien personnel :\n${manageUrl}`
      : "",
    "À très vite,\n\nDamien & Julie",
  ].filter(Boolean).join("\n\n");

  const guestItems = guests
    .map((guest) => `<li>${escapeHtml(guest)}</li>`)
    .join("");
  const nightItems = nights
    .map((night) => `<li>${escapeHtml(night)}</li>`)
    .join("");
  const manageButton = manageUrl
    ? `<p style="margin:28px 0"><a href="${escapeHtml(manageUrl)}" style="display:inline-block;padding:14px 20px;border-radius:999px;background:#273126;color:#fff;text-decoration:none;font-weight:bold">Voir mon inscription</a></p>`
    : "";
  const html = emailFrame(`
    <h1 style="margin:0;font-family:Georgia,serif;font-size:34px;font-weight:normal">Bonjour ${escapeHtml(greetingName)},</h1>
    <p style="line-height:1.7">Petit rappel concernant votre hébergement au Domaine du Massacan pour notre mariage.</p>
    <div style="margin:24px 0;padding:22px;border-radius:16px;background:#f4efe5;line-height:1.65">
      <p style="margin:0 0 16px;color:#9b7b48;font-size:11px;font-weight:bold;letter-spacing:.14em;text-transform:uppercase">Votre réservation</p>
      <p style="margin:0 0 8px"><strong>Personnes hébergées :</strong></p><ul style="margin-top:0">${guestItems}</ul>
      <p style="margin:18px 0 8px"><strong>Nuitée(s) réservée(s) :</strong></p><ul style="margin-top:0">${nightItems}</ul>
      <p><strong>Nombre de personnes :</strong> ${reservation.guests_count}<br><strong>Nombre de nuits :</strong> ${reservation.nights.length}</p>
      <p style="margin-bottom:0"><strong>Montant total :</strong> ${money(reservation.amount_cents)}<br><strong>Montant restant à régler :</strong> ${money(reservation.amount_cents)}</p>
    </div>
    ${paymentInstructionsHtml(reservation)}
    ${manageUrl ? "<p style=\"line-height:1.7\">Vous pouvez retrouver votre inscription, vérifier votre réservation ou modifier vos informations grâce à votre lien personnel :</p>" : ""}
    ${manageButton}
    <p style="margin-top:28px;line-height:1.7">À très vite,<br><br><strong>Damien & Julie</strong></p>
  `);

  return { subject, text: detailsText, html: html, manageUrl };
}

export async function deliverPaymentReminder(
  reservation: LodgingReservation,
  response: WeddingResponse | undefined,
  siteOrigin: string,
) {
  const email = (reservation.email || response?.respondent_email || "")
    .trim()
    .toLowerCase();
  if (!isValidWeddingEmail(email)) throw new Error("L’adresse e-mail est invalide.");
  const message = buildPaymentReminder(reservation, response, siteOrigin);
  const result = await sendWeddingEmail({ to: email, ...message });
  if (!result.sent) throw new Error("L’envoi Gmail n’est pas configuré.");
  return { ...message, email };
}

export async function deliverGuestMessage(
  recipient: AttendingEmailRecipient,
  subjectTemplate: string,
  messageTemplate: string,
) {
  const subject = personalizeGuestMessage(subjectTemplate, recipient.name);
  const content = personalizeGuestMessage(messageTemplate, recipient.name);
  const result = await sendWeddingEmail({
    to: recipient.email,
    subject,
    text: content,
    html: emailFrame(`<div style="font-size:15px;line-height:1.75">${htmlLines(content)}</div>`),
  });
  if (!result.sent) throw new Error("L’envoi Gmail n’est pas configuré.");
  return { subject, content };
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, limit), items.length) }, run),
  );
  return results;
}
