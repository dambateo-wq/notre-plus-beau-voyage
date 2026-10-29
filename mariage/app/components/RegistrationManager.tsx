"use client";

import { useState } from "react";
import Link from "next/link";
import { formatAttendanceDay } from "@/lib/attendance";
import { hasDietaryRequirement } from "@/lib/dietary";
import WeddingSurvey, { type SurveyData } from "./WeddingSurvey";
import type { AdminReservationVersion } from "@/lib/admin-reservation-edit";
import type { AdminRegistrationVersion } from "@/lib/admin-registration-edit";

type ManagedSummary = {
  registration: SurveyData & { id: string };
  reservation: null | {
    reference: string;
    amountCents: number;
    paymentStatus: "unpaid" | "declared" | "confirmed";
    bookingStatus: "active" | "cancelled";
    financialReviewStatus: "none" | "pending";
    previousAmountCents: number | null;
    proposedAmountCents: number | null;
  };
};

function money(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}

export default function RegistrationManager({ data, token, adminReservation, adminRegistration }: { data: ManagedSummary; token?: string; adminReservation?: AdminReservationVersion; adminRegistration?: AdminRegistrationVersion }) {
  const adminEdit = Boolean(adminReservation || adminRegistration);
  const [editing, setEditing] = useState(adminEdit);
  const input = data.registration;
  const reservation = data.reservation;
  const Root = adminEdit ? "section" : "main";
  const dietaryAlerts = (input.dietaryRequirements ?? []).filter(hasDietaryRequirement);

  return (
    <Root className="registration-manage-page">
      <header className="registration-manage-header">
        <Link href={adminEdit ? "/admin" : "/"}>{adminEdit ? "Retour à l’administration" : "D&J · Retour au voyage"}</Link>
        <p className="eyebrow">{adminEdit ? "Modification administrateur" : "Lien personnel"}</p>
        <h1>{adminEdit ? "Modifier l’inscription" : "Mon inscription"}</h1>
        <p>{adminEdit ? "Modifiez les réponses et l’hébergement depuis ce formulaire. L’enregistrement n’envoie pas d’e-mail aux invités." : "Consultez votre réponse et modifiez-la librement si vos plans changent."}</p>
      </header>

      {!editing ? (
        <section className="registration-summary">
          <div className="registration-summary-heading">
            <div><p className="eyebrow">Votre groupe</p><h2>{input.respondentName}</h2></div>
            <span className={input.notAttending ? "summary-status summary-status-declined" : "summary-status"}>{input.notAttending ? "Absent" : "Inscription enregistrée"}</span>
          </div>
          <dl>
            <div><dt>Participants</dt><dd>{[input.respondentName, ...input.companions].join(", ")}</dd></div>
            <div><dt>Jours de présence</dt><dd>{input.notAttending ? "—" : input.attendanceDays.map((day) => formatAttendanceDay(day)).join(" · ")}</dd></div>
            <div><dt>Ville de départ</dt><dd>{input.departureCity ? `${input.departureCity}, ${input.departureCountry}` : "—"}</dd></div>
            <div><dt>Contact</dt><dd>{input.respondentEmail}{input.phone ? ` · ${input.phone}` : ""}</dd></div>
            <div><dt>Hébergement</dt><dd>{input.lodgingGuestNames.length ? `${input.lodgingGuestNames.join(", ")} · ${input.lodgingNights.map((night) => formatAttendanceDay(night)).join(" · ")}` : "Sans hébergement au domaine"}</dd></div>
            <div><dt>Souhait de chambre</dt><dd>{input.roommateWishes || "—"}</dd></div>
            <div><dt>Régimes et allergies</dt><dd>{input.dietaryRequirements === null ? "Informations non renseignées" : dietaryAlerts.length ? dietaryAlerts.map((entry) => `${entry.participantName} : ${entry.diet === "vegetarian" ? "végétarien" : "aucun régime"}${entry.allergies ? ` · ${entry.allergies}` : ""}`).join(" ; ") : "Rien à signaler"}</dd></div>
            <div><dt>Musique</dt><dd>{input.songs.length ? input.songs.join(", ") : "—"}</dd></div>
            <div><dt>Montant</dt><dd>{reservation ? money(reservation.financialReviewStatus === "pending" ? reservation.proposedAmountCents ?? reservation.amountCents : reservation.amountCents) : "—"}</dd></div>
          </dl>
          {reservation?.financialReviewStatus === "pending" && (
            <div className="registration-review-notice">
              <strong>Modification après paiement — à valider</strong>
              <span>Ancien montant : {money(reservation.previousAmountCents ?? reservation.amountCents)} · nouveau montant : {money(reservation.proposedAmountCents ?? reservation.amountCents)}</span>
            </div>
          )}
          <button className="manage-registration-button" type="button" onClick={() => setEditing(true)}>{adminEdit ? "Modifier l’inscription et la réservation" : "Modifier mon inscription"}</button>
        </section>
      ) : (
        <section className="registration-editor">
          <button className="registration-editor-back" type="button" onClick={() => setEditing(false)}>← Revenir au récapitulatif</button>
          <WeddingSurvey initialData={input} manageToken={token} adminReservation={adminReservation} adminRegistration={adminRegistration} />
        </section>
      )}
    </Root>
  );
}
