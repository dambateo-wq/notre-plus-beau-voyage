"use client";

import { useMemo, useState, useTransition } from "react";
import { sendManualPaymentReminders, type ManualEmailActionResult } from "./actions";
import styles from "./admin.module.css";

type ReminderCandidate = {
  reservationId: string;
  name: string;
  email: string;
  amountCents: number;
  lastReminderAt: string | null;
  reminderCount: number;
  canSend: boolean;
};

function money(cents: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

function reminderDate(value: string | null) {
  if (!value) return "Jamais relancé";
  return `Dernière relance : ${new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeZone: "Europe/Paris",
  }).format(new Date(value))}`;
}

export default function PaymentReminderManager({
  paidCount,
  pendingCount,
  pendingAmountCents,
  candidates,
  historyAvailable,
}: {
  paidCount: number;
  pendingCount: number;
  pendingAmountCents: number;
  candidates: ReminderCandidate[];
  historyAvailable: boolean;
}) {
  const actionable = useMemo(
    () => candidates.filter((candidate) => candidate.canSend),
    [candidates],
  );
  const [selected, setSelected] = useState(
    () => new Set(actionable.map((candidate) => candidate.reservationId)),
  );
  const [panel, setPanel] = useState<"closed" | "selection" | "confirmation">("closed");
  const [result, setResult] = useState<ManualEmailActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function close() {
    if (pending) return;
    setPanel("closed");
  }

  function send() {
    const ids = [...selected];
    if (!ids.length) return;
    setResult(null);
    startTransition(async () => {
      const nextResult = await sendManualPaymentReminders(ids);
      setResult(nextResult);
      if (nextResult.sentCount > 0) setPanel("selection");
    });
  }

  return (
    <section className={styles.emailAdminCard} aria-labelledby="payment-reminders-title">
      <div className={styles.emailAdminHeading}>
        <div>
          <p className={styles.eyebrow}>Hébergement · Paiements</p>
          <h2 id="payment-reminders-title">Paiements hébergement</h2>
        </div>
        <div className={styles.paymentSummary} aria-label="Résumé des paiements">
          <span><strong>{paidCount}</strong> payé{paidCount > 1 ? "s" : ""}</span>
          <span><strong>{pendingCount}</strong> en attente</span>
          <span><strong>{money(pendingAmountCents)}</strong> à recevoir</span>
        </div>
      </div>

      {!historyAvailable && (
        <p className={styles.emailSetupNotice}>
          Exécutez la migration Supabase des e-mails manuels pour activer les relances et leur historique.
        </p>
      )}

      <button
        className={styles.primaryButton}
        type="button"
        disabled={!historyAvailable || actionable.length === 0}
        onClick={() => {
          setResult(null);
          setPanel("selection");
        }}
      >
        Relancer les paiements en attente
      </button>
      {pendingCount > actionable.length && (
        <p className={styles.emailHint}>
          {pendingCount - actionable.length} réservation{pendingCount - actionable.length > 1 ? "s" : ""} sans adresse e-mail valide ne peut pas être relancée par e-mail.
        </p>
      )}

      {panel !== "closed" && (
        <div className={styles.adminModalBackdrop} role="presentation" onMouseDown={close}>
          <section
            className={styles.adminModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-reminder-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className={styles.adminModalHeading}>
              <div>
                <p className={styles.eyebrow}>Relance manuelle</p>
                <h3 id="bulk-reminder-title">Paiements en attente</h3>
              </div>
              <button type="button" onClick={close} aria-label="Fermer">×</button>
            </div>

            <div className={styles.emailRecipientList}>
              {candidates.map((candidate) => (
                <label key={candidate.reservationId} className={!candidate.canSend ? styles.recipientDisabled : ""}>
                  <input
                    type="checkbox"
                    checked={selected.has(candidate.reservationId)}
                    disabled={!candidate.canSend || pending}
                    onChange={() => toggle(candidate.reservationId)}
                  />
                  <span>
                    <strong>{candidate.name}</strong>
                    <small>{candidate.email || "Aucune adresse e-mail"}</small>
                    <small>{reminderDate(candidate.lastReminderAt)}</small>
                  </span>
                  <b>{money(candidate.amountCents)}</b>
                </label>
              ))}
            </div>

            <p className={styles.emailSelectionCount}>
              {selected.size} relance{selected.size > 1 ? "s" : ""} sera{selected.size > 1 ? "ont" : ""} envoyée{selected.size > 1 ? "s" : ""}.
            </p>

            {result && <EmailResult result={result} />}

            {panel === "confirmation" ? (
              <div className={styles.finalConfirmation}>
                <strong>Envoyer les relances sélectionnées ?</strong>
                <p>Chaque destinataire recevra un e-mail individuel.</p>
                <div>
                  <button type="button" disabled={pending} onClick={() => setPanel("selection")}>Annuler</button>
                  <button type="button" disabled={pending || selected.size === 0} onClick={send}>
                    {pending ? "Envoi en cours…" : "Envoyer les relances"}
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.adminModalActions}>
                <button type="button" onClick={close}>Annuler</button>
                <button
                  type="button"
                  disabled={selected.size === 0}
                  onClick={() => setPanel("confirmation")}
                >
                  Continuer
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
}

export function EmailResult({ result }: { result: ManualEmailActionResult }) {
  return (
    <div className={result.failedCount || result.error ? styles.emailResultError : styles.emailResultSuccess} aria-live="polite">
      {result.error ? (
        <strong>{result.error}</strong>
      ) : (
        <>
          <strong>{result.sentCount} e-mail{result.sentCount > 1 ? "s" : ""} envoyé{result.sentCount > 1 ? "s" : ""}</strong>
          {result.failedCount > 0 && <span>{result.failedCount} échec{result.failedCount > 1 ? "s" : ""}</span>}
          {result.failures.map((failure) => (
            <small key={`${failure.recipient}-${failure.error}`}>{failure.recipient} · {failure.error}</small>
          ))}
          {result.warning && <small>{result.warning}</small>}
        </>
      )}
    </div>
  );
}
