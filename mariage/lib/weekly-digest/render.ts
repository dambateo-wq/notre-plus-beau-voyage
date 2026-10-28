import { emailFrame, escapeHtml } from "@/lib/email";
import { formatAttendanceDay } from "@/lib/attendance";
import { frenchDate } from "./time";
import type { WeeklyDigest } from "./model";

export const DIGEST_RECIPIENT_KEYS = ["damien", "julie"] as const;
export const WEDDING_ORIGIN = "https://les-dadjus-notre-plus-beau-voyage.vercel.app";
export const WEDDING_ADMIN_URL = `${WEDDING_ORIGIN}/admin`;
const money = (cents: number | null) => cents === null ? "À vérifier" : new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
export function nightLabel(night: string) {
  return night === "2027-05-28" ? "Vendredi 28 mai" : night === "2027-05-29" ? "Samedi 29 mai" : night;
}
function paragraph(value: string) { return `<p style="margin:6px 0;line-height:1.6;overflow-wrap:anywhere">${escapeHtml(value)}</p>`; }
function card(content: string) { return `<div style="margin:12px 0;padding:14px;border:1px solid #e4dccf;border-radius:12px">${content}</div>`; }
function section(title: string, content: string) { return `<h2 style="margin:28px 0 12px;font-size:20px;line-height:1.3">${escapeHtml(title)}</h2>${content}`; }
function adminButton() {
  return `<table role="presentation" style="margin:28px 0;width:100%"><tr><td style="background:#273126;border-radius:10px;text-align:center"><a href="${WEDDING_ADMIN_URL}" style="display:block;padding:16px 12px;color:#ffffff;font-weight:bold;text-decoration:none;line-height:1.5">Accéder à l’espace administrateur</a></td></tr></table>`;
}

export function renderWeeklyDigest(digest: WeeklyDigest, test = false) {
  const subject = `${test ? "[TEST] " : ""}💍 Bilan mariage – Semaine du ${frenchDate(digest.window.start)} au ${frenchDate(digest.window.end)}`;
  const summary = [
    `${digest.newPeopleCount} nouvelles personnes inscrites (${digest.newFormCount} formulaire(s) reçu(s), dont ${digest.newDeclinedCount} réponse(s) d’absence)`,
    `${digest.totalPeopleCount} personnes inscrites au total`,
    `${digest.unplaced.length} personnes restant à placer`,
    `${digest.payments.length} réservations non intégralement réglées ou à vérifier`,
    `Total restant à encaisser : ${money(digest.outstandingCents)}`,
  ];
  const registrations = digest.newRegistrations.map(r => {
    const lines = [
      `Répondant : ${r.respondent_name}`,
      `Accompagnants : ${r.companions.join(", ") || "Aucun"}`,
      `Personnes : ${r.not_attending ? "0 présente (réponse d’absence)" : 1 + r.companions.length}`,
      `Présence : ${r.not_attending ? "Absent" : r.attendance_days.map(formatAttendanceDay).join(" · ")}`,
      `Nuitées : ${r.lodging_nights.map(nightLabel).join(" · ") || "Aucune"}`,
      `Colocation : ${r.roommate_wishes || "Aucun souhait indiqué"}`,
    ];
    return { lines, html: card(lines.map(paragraph).join("")) };
  });
  const placementTotals = digest.nights.map(n => `${nightLabel(n)} : ${digest.placementByNight[n]} personne(s) à placer`);
  const unplaced = digest.unplaced.map(p => {
    const lines = [p.name, `Nuit(s) à attribuer : ${p.nights.map(nightLabel).join(" · ")}`, `Réservation : ${p.reference}`, `Colocation : ${p.wishes || "Aucun souhait indiqué"}`];
    return { lines, html: card(lines.map(paragraph).join("")) };
  });
  const payments = digest.payments.map(p => {
    const method = p.payment_method === "wero" ? "Wero" : p.payment_method === "bank_transfer" ? "Virement" : "Autre / à préciser";
    const status = p.due === null ? "Montant encaissé à vérifier" : p.received_amount_cents! > 0 ? "Paiement partiel" : p.payment_status === "declared" ? "Paiement déclaré, réception non confirmée" : "À recevoir";
    const lines = [
      `${p.booker_name} · ${p.reference}`,
      `Personnes : ${p.guest_names.join(", ")}`,
      `Nuitées : ${p.nights.map(nightLabel).join(" · ")} (${p.nights.length} nuit(s), ${p.guests_count * p.nights.length} personne-nuitées)`,
      `Montant total enregistré : ${money(p.amount_cents)}`,
      `Montant encaissé vérifié : ${money(p.received_amount_cents)}`,
      `Solde dû : ${money(p.due)}`,
      `Moyen prévu : ${method} · Statut : ${status}`,
      ...(p.financial_review_status === "pending" ? [`Modification à valider : nouveau montant proposé ${money(p.proposed_amount_cents)}`] : []),
    ];
    return { lines, html: card(lines.map(paragraph).join("")) };
  });
  const warnings = digest.warnings.length ? section("Points à vérifier", digest.warnings.map(paragraph).join("")) : "";
  const html = emailFrame(
    `<h1 style="font-size:26px;line-height:1.3;margin:0 0 14px">${test ? "Aperçu de test — " : ""}Votre bilan du mariage</h1>`
    + paragraph(`Du ${frenchDate(digest.window.start, true)} au ${frenchDate(digest.window.end, true)}, heure de Paris. Fin de période exclue.`)
    + paragraph(`Situation relevée le ${frenchDate(digest.capturedAt, true)}. Tarif de référence : ${money(digest.priceCents)} par personne et par nuit.`)
    + section("Résumé général", summary.map(paragraph).join(""))
    + adminButton()
    + section("Nouvelles inscriptions", registrations.map(r => r.html).join("") || paragraph("Aucune nouvelle inscription sur cette période."))
    + section("Personnes restant à placer", placementTotals.map(paragraph).join("") + (unplaced.map(p => p.html).join("") || paragraph("Toutes les personnes hébergées ont une affectation pour leurs nuits réservées.")))
    + section("Paiements en attente", (payments.map(p => p.html).join("") || paragraph("Aucun solde restant dû.")) + paragraph(`Total restant à encaisser : ${money(digest.outstandingCents)}`))
    + warnings
    + adminButton()
    + paragraph("L’administration reste protégée par son authentification habituelle."),
  );
  const text = [subject, `Période : ${frenchDate(digest.window.start, true)} → ${frenchDate(digest.window.end, true)} (Europe/Paris, fin exclue).`,
    `Situation au ${frenchDate(digest.capturedAt, true)}.`, "Résumé général", ...summary,
    "Nouvelles inscriptions", ...(registrations.length ? registrations.flatMap(r => [...r.lines, ""]) : ["Aucune nouvelle inscription."]),
    "Personnes restant à placer", ...placementTotals, ...unplaced.flatMap(p => [...p.lines, ""]),
    "Paiements en attente", ...payments.flatMap(p => [...p.lines, ""]), `Total restant à encaisser : ${money(digest.outstandingCents)}`,
    ...digest.warnings, "Accéder à l’espace administrateur", WEDDING_ADMIN_URL].join("\n");
  return { subject, html, text };
}
