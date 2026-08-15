"use client";

import { useMemo, useState, useTransition } from "react";
import { sendManualGuestMessage, type ManualEmailActionResult } from "./actions";
import { EmailResult } from "./PaymentReminderManager";
import styles from "./admin.module.css";

type Recipient = {
  responseId: string;
  name: string;
  email: string;
  days: string[];
};

type CampaignSummary = {
  createdAt: string;
  subject: string;
  selectedCount: number;
  sentCount: number;
  failedCount: number;
} | null;

const DAY_LABELS: Record<string, string> = {
  "2027-05-28": "Vendredi",
  "2027-05-29": "Samedi",
  "2027-05-30": "Dimanche",
};

const DEFAULT_MESSAGE = `Bonjour {{prenom}},



À très vite,

Damien & Julie`;

export default function GuestMessageManager({
  registrationsCount,
  recipients,
  lastCampaign,
  historyAvailable,
}: {
  registrationsCount: number;
  recipients: Recipient[];
  lastCampaign: CampaignSummary;
  historyAvailable: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<"compose" | "preview" | "confirmation">("compose");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [selected, setSelected] = useState(() => new Set(recipients.map((recipient) => recipient.email)));
  const [showRecipients, setShowRecipients] = useState(true);
  const [result, setResult] = useState<ManualEmailActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const selectedRecipients = useMemo(
    () => recipients.filter((recipient) => selected.has(recipient.email)),
    [recipients, selected],
  );

  function toggle(email: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  }

  function close() {
    if (pending) return;
    setOpen(false);
  }

  function send() {
    setResult(null);
    startTransition(async () => {
      const nextResult = await sendManualGuestMessage({
        recipientEmails: selectedRecipients.map((recipient) => recipient.email),
        subject,
        message,
      });
      setResult(nextResult);
      if (nextResult.sentCount > 0) setStage("preview");
    });
  }

  return (
    <section className={styles.emailAdminCard} aria-labelledby="guest-message-title">
      <div className={styles.emailAdminHeading}>
        <div>
          <p className={styles.eyebrow}>Communication</p>
          <h2 id="guest-message-title">Envoyer un message aux invités présents</h2>
        </div>
        <div className={styles.emailAudienceSummary}>
          <span><strong>{registrationsCount}</strong> inscription{registrationsCount > 1 ? "s" : ""} présente{registrationsCount > 1 ? "s" : ""}</span>
          <span><strong>{recipients.length}</strong> adresse{recipients.length > 1 ? "s" : ""} e-mail unique{recipients.length > 1 ? "s" : ""}</span>
        </div>
      </div>

      {lastCampaign && (
        <p className={styles.lastCampaign}>
          Dernier message envoyé : {new Intl.DateTimeFormat("fr-FR", {
            dateStyle: "long",
            timeStyle: "short",
            timeZone: "Europe/Paris",
          }).format(new Date(lastCampaign.createdAt))} · {lastCampaign.sentCount} destinataire{lastCampaign.sentCount > 1 ? "s" : ""}
          {lastCampaign.failedCount > 0 ? ` · ${lastCampaign.failedCount} échec${lastCampaign.failedCount > 1 ? "s" : ""}` : ""}
        </p>
      )}
      {!historyAvailable && (
        <p className={styles.emailSetupNotice}>
          Exécutez la migration Supabase des e-mails manuels pour activer les campagnes et leur historique.
        </p>
      )}
      <button
        className={styles.primaryButton}
        type="button"
        disabled={!historyAvailable || recipients.length === 0}
        onClick={() => {
          setResult(null);
          setStage("compose");
          setOpen(true);
        }}
      >
        Rédiger un message
      </button>

      {open && (
        <div className={styles.adminModalBackdrop} role="presentation" onMouseDown={close}>
          <section
            className={`${styles.adminModal} ${styles.messageAdminModal}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="message-composer-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className={styles.adminModalHeading}>
              <div>
                <p className={styles.eyebrow}>Envoi manuel et individuel</p>
                <h3 id="message-composer-title">Message aux invités présents</h3>
              </div>
              <button type="button" onClick={close} aria-label="Fermer">×</button>
            </div>

            {stage === "compose" ? (
              <div className={styles.messageComposer}>
                <label>
                  Objet
                  <input
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    maxLength={160}
                    placeholder="Informations pour notre mariage"
                  />
                </label>
                <label>
                  Message
                  <textarea
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    rows={12}
                    maxLength={12000}
                  />
                </label>
                <p className={styles.emailHint}>
                  Vous pouvez utiliser <code>{"{{prenom}}"}</code> et <code>{"{{nom}}"}</code>. Les retours à la ligne seront conservés.
                </p>
                <div className={styles.adminModalActions}>
                  <button type="button" onClick={close}>Annuler</button>
                  <button
                    type="button"
                    disabled={!subject.trim() || !message.trim()}
                    onClick={() => setStage("preview")}
                  >
                    Prévisualiser
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className={styles.messagePreview}>
                  <span>Objet</span>
                  <strong>{subject}</strong>
                  <span>Message</span>
                  <div>{message}</div>
                </div>

                <button
                  className={styles.recipientToggle}
                  type="button"
                  aria-expanded={showRecipients}
                  onClick={() => setShowRecipients((current) => !current)}
                >
                  Voir les destinataires <span>{showRecipients ? "−" : "+"}</span>
                </button>
                {showRecipients && (
                  <div className={styles.emailRecipientList}>
                    {recipients.map((recipient) => (
                      <label key={recipient.email}>
                        <input
                          type="checkbox"
                          checked={selected.has(recipient.email)}
                          disabled={pending}
                          onChange={() => toggle(recipient.email)}
                        />
                        <span>
                          <strong>{recipient.name}</strong>
                          <small>{recipient.email}</small>
                          <small>{recipient.days.map((day) => DAY_LABELS[day] ?? day).join(" / ")}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
                <p className={styles.emailSelectionCount}>
                  {selectedRecipients.length} e-mail{selectedRecipients.length > 1 ? "s" : ""} sélectionné{selectedRecipients.length > 1 ? "s" : ""}
                </p>
                {result && <EmailResult result={result} />}

                {stage === "confirmation" ? (
                  <div className={styles.finalConfirmation}>
                    <strong>Vous allez envoyer ce message à {selectedRecipients.length} adresse{selectedRecipients.length > 1 ? "s" : ""} e-mail.</strong>
                    <p>Chaque invité recevra son propre e-mail, sans voir les autres destinataires.</p>
                    <div>
                      <button type="button" disabled={pending} onClick={() => setStage("preview")}>Annuler</button>
                      <button type="button" disabled={pending || selectedRecipients.length === 0} onClick={send}>
                        {pending ? "Envoi en cours…" : "Envoyer les e-mails"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className={styles.adminModalActions}>
                    <button type="button" onClick={() => setStage("compose")}>Modifier le message</button>
                    <button
                      type="button"
                      disabled={selectedRecipients.length === 0}
                      onClick={() => setStage("confirmation")}
                    >
                      Continuer
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
