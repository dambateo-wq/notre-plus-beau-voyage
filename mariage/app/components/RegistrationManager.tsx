"use client";

import { useState } from "react";
import Link from "next/link";
import WeddingSurvey, { type SurveyData } from "./WeddingSurvey";

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

const dayLabels: Record<string, string> = {
  "2027-05-28": "Vendredi 28 mai",
  "2027-05-29": "Samedi 29 mai",
  "2027-05-30": "Dimanche 30 mai",
};

function money(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}

export default function RegistrationManager({ data, token }: { data: ManagedSummary; token: string }) {
  const [editing, setEditing] = useState(false);
  const input = data.registration;
  const reservation = data.reservation;

  return (
    <main className="registration-manage-page">
      <header className="registration-manage-header">
        <Link href="/">D&amp;J · Retour au voyage</Link>
        <p className="eyebrow">Lien personnel</p>
        <h1>Mon inscription</h1>
        <p>Consultez votre réponse et modifiez-la librement si vos plans changent.</p>
      </header>

      {!editing ? (
        <section className="registration-summary">
          <div className="registration-summary-heading">
            <div><p className="eyebrow">Votre groupe</p><h2>{input.respondentName}</h2></div>
            <span className={input.notAttending ? "summary-status summary-status-declined" : "summary-status"}>{input.notAttending ? "Absent" : "Inscription enregistrée"}</span>
          </div>
          <dl>
            <div><dt>Participants</dt><dd>{[input.respondentName, ...input.companions].join(", ")}</dd></div>
            <div><dt>Jours de présence</dt><dd>{input.notAttending ? "—" : input.attendanceDays.map((day) => dayLabels[day] ?? day).join(" · ")}</dd></div>
            <div><dt>Ville de départ</dt><dd>{input.departureCity ? `${input.departureCity}, ${input.departureCountry}` : "—"}</dd></div>
            <div><dt>Contact</dt><dd>{input.respondentEmail}{input.phone ? ` · ${input.phone}` : ""}</dd></div>
            <div><dt>Hébergement</dt><dd>{input.lodgingGuestNames.length ? `${input.lodgingGuestNames.join(", ")} · ${input.lodgingNights.map((night) => dayLabels[night] ?? night).join(" · ")}` : "Sans hébergement au domaine"}</dd></div>
            <div><dt>Souhait de chambre</dt><dd>{input.roommateWishes || "—"}</dd></div>
            <div><dt>Musique</dt><dd>{input.songs.length ? input.songs.join(", ") : "—"}</dd></div>
            <div><dt>Montant</dt><dd>{reservation ? money(reservation.financialReviewStatus === "pending" ? reservation.proposedAmountCents ?? reservation.amountCents : reservation.amountCents) : "—"}</dd></div>
          </dl>
          {reservation?.financialReviewStatus === "pending" && (
            <div className="registration-review-notice">
              <strong>Modification après paiement — à valider</strong>
              <span>Ancien montant : {money(reservation.previousAmountCents ?? reservation.amountCents)} · nouveau montant : {money(reservation.proposedAmountCents ?? reservation.amountCents)}</span>
            </div>
          )}
          <button className="manage-registration-button" type="button" onClick={() => setEditing(true)}>Modifier mon inscription</button>
        </section>
      ) : (
        <section className="registration-editor">
          <button className="registration-editor-back" type="button" onClick={() => setEditing(false)}>← Revenir au récapitulatif</button>
          <WeddingSurvey initialData={input} manageToken={token} />
        </section>
      )}
    </main>
  );
}
