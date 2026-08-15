import "server-only";

import { emailFrame, escapeHtml, sendWeddingEmail } from "@/lib/email";
import { getPaymentDetails } from "@/lib/lodging";
import { lodgingAmount, type RegistrationInput } from "@/lib/registration";

const dayLabels: Record<string, string> = {
  "2027-05-28": "vendredi 28 mai",
  "2027-05-29": "samedi 29 mai",
  "2027-05-30": "dimanche 30 mai",
};

function money(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}

function detailsHtml(input: RegistrationInput) {
  const participants = [input.respondentName, ...input.companions].join(", ");
  const days = input.notAttending ? "Ne pourra pas être présent" : input.attendanceDays.map((day) => dayLabels[day] ?? day).join(", ");
  const amount = lodgingAmount(input);
  return `
    <div style="margin:24px 0;padding:20px;border-radius:16px;background:#f4efe5">
      <p style="margin:0 0 10px"><strong>Participants :</strong> ${escapeHtml(participants)}</p>
      <p style="margin:0 0 10px"><strong>Présence :</strong> ${escapeHtml(days)}</p>
      ${amount > 0 ? `<p style="margin:0 0 10px"><strong>Hébergement :</strong> ${escapeHtml(input.lodgingGuestNames.join(", "))} · ${escapeHtml(input.lodgingNights.map((night) => dayLabels[night] ?? night).join(", "))}</p><p style="margin:0"><strong>Participation :</strong> ${money(amount)}</p>` : "<p style=\"margin:0\"><strong>Hébergement :</strong> sans hébergement au domaine</p>"}
    </div>`;
}

function paymentHtml(input: RegistrationInput) {
  if (!input.lodgingNights.length) return "";
  const payment = getPaymentDetails();
  if (input.paymentMethod === "wero") {
    return `<p style="line-height:1.6"><strong>Règlement Wero :</strong> ${payment.weroPhone ? escapeHtml(payment.weroPhone) : "les coordonnées vous seront communiquées par Damien et Julie"}.</p>`;
  }
  if (input.paymentMethod === "bank_transfer") {
    return `<div style="line-height:1.7"><p><strong>Virement bancaire</strong></p><p>Titulaire : ${escapeHtml(payment.accountHolder || "à demander à Damien et Julie")}<br>IBAN : ${escapeHtml(payment.iban || "à demander à Damien et Julie")}<br>BIC : ${escapeHtml(payment.bic || "à demander à Damien et Julie")}</p></div>`;
  }
  return `<p style="line-height:1.6">Vous avez choisi de régler l’hébergement plus tard. Votre réservation reste visible depuis votre lien personnel.</p>`;
}

function manageButton(manageUrl: string) {
  return `<p style="margin:28px 0"><a href="${escapeHtml(manageUrl)}" style="display:inline-block;padding:14px 20px;border-radius:999px;background:#273126;color:#fff;text-decoration:none;font-weight:bold">Voir ou modifier mon inscription</a></p>`;
}

export async function sendRegistrationConfirmation(
  input: RegistrationInput,
  manageUrl: string,
  options?: { previousAmountCents?: number; pendingValidation?: boolean },
) {
  const newAmount = lodgingAmount(input);
  const difference = options?.previousAmountCents === undefined ? null : newAmount - options.previousAmountCents;
  const heading = options?.pendingValidation
    ? "Votre modification est bien enregistrée et doit maintenant être validée."
    : "Votre inscription est bien enregistrée.";
  const change = difference === null
    ? ""
    : `<div style="margin:18px 0;padding:16px;border-left:3px solid #b99a68;background:#f5ecdd"><p style="margin:0 0 7px">Ancien montant : <strong>${money(options!.previousAmountCents!)}</strong></p><p style="margin:0 0 7px">Nouveau montant : <strong>${money(newAmount)}</strong></p><p style="margin:0">Écart : <strong>${difference >= 0 ? "+" : ""}${money(difference)}</strong></p></div>`;

  const text = [
    heading,
    `Participants : ${[input.respondentName, ...input.companions].join(", ")}`,
    `Présence : ${input.notAttending ? "absent" : input.attendanceDays.map((day) => dayLabels[day] ?? day).join(", ")}`,
    input.lodgingNights.length ? `Hébergement : ${input.lodgingGuestNames.join(", ")} · ${money(newAmount)}` : "Sans hébergement au domaine",
    difference === null ? "" : `Ancien montant : ${money(options!.previousAmountCents!)} · Nouveau montant : ${money(newAmount)} · Écart : ${difference >= 0 ? "+" : ""}${money(difference)}`,
    `Voir ou modifier mon inscription : ${manageUrl}`,
    "Gardez cet e-mail : ce lien vous permettra de modifier votre inscription si vos plans changent.",
  ].filter(Boolean).join("\n\n");

  return sendWeddingEmail({
    to: input.respondentEmail,
    subject: "Votre inscription — Damien & Julie",
    text,
    html: emailFrame(`
      <h1 style="margin:0;font-family:Georgia,serif;font-size:34px;font-weight:normal">${escapeHtml(heading)}</h1>
      ${detailsHtml(input)}
      ${change}
      ${paymentHtml(input)}
      ${manageButton(manageUrl)}
      <p style="color:#667064;line-height:1.6">Gardez cet e-mail : ce lien vous permettra de modifier votre inscription si vos plans changent.</p>
    `),
  });
}

export async function sendAdminFinancialChange(
  name: string,
  oldAmountCents: number,
  newAmountCents: number,
  adminUrl: string,
) {
  const adminEmail = process.env.WEDDING_ADMIN_EMAIL;
  if (!adminEmail) return { sent: false as const, reason: "not_configured" as const };
  const difference = newAmountCents - oldAmountCents;
  return sendWeddingEmail({
    to: adminEmail,
    subject: `Modification d’hébergement à valider — ${name}`,
    text: `${name} a modifié son hébergement.\nAncien montant : ${money(oldAmountCents)}\nNouveau montant : ${money(newAmountCents)}\nÉcart : ${difference >= 0 ? "+" : ""}${money(difference)}\n${adminUrl}`,
    html: emailFrame(`
      <h1 style="font-family:Georgia,serif;font-weight:normal">Modification à valider</h1>
      <p><strong>${escapeHtml(name)}</strong> a modifié son hébergement après confirmation du paiement.</p>
      <p>Ancien montant : <strong>${money(oldAmountCents)}</strong><br>Nouveau montant : <strong>${money(newAmountCents)}</strong><br>Écart : <strong>${difference >= 0 ? "+" : ""}${money(difference)}</strong></p>
      <p><a href="${escapeHtml(adminUrl)}" style="display:inline-block;padding:13px 19px;border-radius:999px;background:#273126;color:#fff;text-decoration:none">Ouvrir l’administration</a></p>
    `),
  });
}
