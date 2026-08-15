"use client";

import { useState, useTransition } from "react";
import { sendManualPaymentReminders, type ManualEmailActionResult } from "./actions";
import { EmailResult } from "./PaymentReminderManager";
import styles from "./admin.module.css";

function money(cents: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

function dateLabel(value: string | null) {
  if (!value) return "Aucune relance envoyée";
  return `Dernière relance : ${new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeZone: "Europe/Paris",
  }).format(new Date(value))}`;
}

export default function PaymentReminderAction({
  candidate,
  historyAvailable,
}: {
  candidate: {
    reservationId: string;
    name: string;
    email: string;
    amountCents: number;
    lastReminderAt: string | null;
    reminderCount: number;
    canSend: boolean;
  };
  historyAvailable: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ManualEmailActionResult | null>(null);

  function send() {
    setResult(null);
    startTransition(async () => {
      const nextResult = await sendManualPaymentReminders([candidate.reservationId]);
      setResult(nextResult);
      if (nextResult.sentCount > 0 && nextResult.failedCount === 0) {
        window.setTimeout(() => setOpen(false), 1600);
      }
    });
  }

  return (
    <div className={styles.reminderInline}>
      <span>Paiement en attente · {money(candidate.amountCents)}</span>
      <small>{dateLabel(candidate.lastReminderAt)}</small>
      <small>{candidate.reminderCount} relance{candidate.reminderCount > 1 ? "s" : ""} envoyée{candidate.reminderCount > 1 ? "s" : ""}</small>
      {candidate.canSend && historyAvailable ? (
        <button type="button" onClick={() => { setResult(null); setOpen(true); }}>
          Envoyer une relance
        </button>
      ) : (
        <small>{!historyAvailable ? "Migration e-mail requise" : "Adresse e-mail manquante ou invalide"}</small>
      )}

      {open && (
        <div className={styles.adminModalBackdrop} role="presentation" onMouseDown={() => !pending && setOpen(false)}>
          <section
            className={`${styles.adminModal} ${styles.smallAdminModal}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`reminder-${candidate.reservationId}`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <p className={styles.eyebrow}>Relance individuelle</p>
            <h3 id={`reminder-${candidate.reservationId}`}>
              Envoyer une relance à {candidate.name} pour {money(candidate.amountCents)} ?
            </h3>
            <p>L’e-mail sera envoyé uniquement à {candidate.email}.</p>
            {result && <EmailResult result={result} />}
            <div className={styles.adminModalActions}>
              <button type="button" disabled={pending} onClick={() => setOpen(false)}>Annuler</button>
              <button type="button" disabled={pending} onClick={send}>
                {pending ? "Envoi en cours…" : "Envoyer la relance"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
