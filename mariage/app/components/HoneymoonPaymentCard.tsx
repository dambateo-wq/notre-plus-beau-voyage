"use client";

import { useEffect, useRef, useState } from "react";

type CopyTarget = "iban" | "reference" | "wero";
type ContributionMode = "bank" | "wero";

type HoneymoonPaymentCardProps = {
  accountHolder: string;
  iban: string;
  bic: string;
  weroPhone: string;
};

const TRANSFER_REFERENCE = "VOYAGE - Prénom Nom";

function fallbackCopy(value: string) {
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.inset = "0 auto auto -9999px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  return copied;
}

export default function HoneymoonPaymentCard({
  accountHolder,
  iban,
  bic,
  weroPhone,
}: HoneymoonPaymentCardProps) {
  const [copied, setCopied] = useState<CopyTarget | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<ContributionMode | null>(null);
  const resetTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current) window.clearTimeout(resetTimer.current);
    },
    [],
  );

  async function copyValue(target: CopyTarget, value: string) {
    let succeeded = false;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        succeeded = true;
      } else {
        succeeded = fallbackCopy(value);
      }
    } catch {
      succeeded = fallbackCopy(value);
    }

    if (!succeeded) return;

    setCopied(target);
    if (resetTimer.current) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setCopied(null), 2200);
  }

  return (
    <article className="honeymoon-payment-card" aria-labelledby="honeymoon-payment-title">
      <div className="honeymoon-payment-heading">
        <div>
          <p>Un petit bout du chemin</p>
          <h3 id="honeymoon-payment-title">Participer à notre voyage de noces</h3>
        </div>
        <span aria-hidden="true">D&amp;J</span>
      </div>

      {!expanded ? (
        <button
          className="honeymoon-reveal-button"
          type="button"
          aria-expanded="false"
          aria-controls="honeymoon-bank-panel"
          onClick={() => setExpanded(true)}
        >
          Participer à notre voyage de noces <span aria-hidden="true">↓</span>
        </button>
      ) : (
        <div className="honeymoon-bank-panel" id="honeymoon-bank-panel">
          <div className="honeymoon-payment-choice-heading">
            <p>Comment souhaitez-vous participer&nbsp;?</p>
            <div className="honeymoon-payment-choices" role="group" aria-label="Moyen de participation">
              {accountHolder && iban && bic && (
                <button
                  type="button"
                  aria-pressed={mode === "bank"}
                  onClick={() => setMode("bank")}
                >
                  Par virement bancaire
                </button>
              )}
              {weroPhone && (
                <button
                  type="button"
                  aria-pressed={mode === "wero"}
                  onClick={() => setMode("wero")}
                >
                  Par Wero
                </button>
              )}
            </div>
          </div>

          {mode === "bank" && (
            <div className="honeymoon-mode-panel" key="bank">
              <p className="honeymoon-mode-label">Mode de participation : <strong>Virement bancaire</strong></p>
              <dl className="honeymoon-bank-details">
                <div>
                  <dt>Titulaire du compte</dt>
                  <dd>{accountHolder}</dd>
                </div>
                <div>
                  <dt>IBAN</dt>
                  <dd>{iban}</dd>
                </div>
                <div>
                  <dt>BIC</dt>
                  <dd>{bic}</dd>
                </div>
                <div className="honeymoon-reference">
                  <dt>Référence conseillée</dt>
                  <dd>{TRANSFER_REFERENCE}</dd>
                  <p>Remplacez « Prénom Nom » par votre identité pour nous aider à reconnaître votre participation.</p>
                </div>
              </dl>
              <div className="honeymoon-copy-actions">
                <button type="button" onClick={() => copyValue("iban", iban)}>
                  <span>{copied === "iban" ? "IBAN copié" : "Copier l’IBAN"}</span>
                  <i aria-hidden="true">{copied === "iban" ? "✓" : "⧉"}</i>
                </button>
                <button type="button" onClick={() => copyValue("reference", TRANSFER_REFERENCE)}>
                  <span>{copied === "reference" ? "Référence copiée" : "Copier la référence"}</span>
                  <i aria-hidden="true">{copied === "reference" ? "✓" : "⧉"}</i>
                </button>
              </div>
            </div>
          )}

          {mode === "wero" && (
            <div className="honeymoon-mode-panel" key="wero">
              <p className="honeymoon-mode-label">Mode de participation : <strong>Wero</strong></p>
              <dl className="honeymoon-bank-details honeymoon-wero-details">
                <div>
                  <dt>Numéro</dt>
                  <dd>{weroPhone}</dd>
                </div>
                <div className="honeymoon-reference">
                  <dt>Référence conseillée</dt>
                  <dd>{TRANSFER_REFERENCE}</dd>
                  <p>Remplacez « Prénom Nom » par votre identité pour nous aider à reconnaître votre participation.</p>
                </div>
              </dl>
              <div className="honeymoon-copy-actions">
                <button type="button" onClick={() => copyValue("wero", weroPhone)}>
                  <span>{copied === "wero" ? "Numéro copié" : "Copier le numéro"}</span>
                  <i aria-hidden="true">{copied === "wero" ? "✓" : "⧉"}</i>
                </button>
                <button type="button" onClick={() => copyValue("reference", TRANSFER_REFERENCE)}>
                  <span>{copied === "reference" ? "Référence copiée" : "Copier la référence"}</span>
                  <i aria-hidden="true">{copied === "reference" ? "✓" : "⧉"}</i>
                </button>
              </div>
            </div>
          )}

          <p className="honeymoon-copy-status" aria-live="polite" aria-atomic="true">
            {copied === "iban" ? "IBAN copié" : copied === "wero" ? "Numéro copié" : copied === "reference" ? "Référence copiée" : ""}
          </p>
          <button className="honeymoon-close-button" type="button" onClick={() => { setExpanded(false); setMode(null); }}>
            Masquer les coordonnées <span aria-hidden="true">↑</span>
          </button>
        </div>
      )}
    </article>
  );
}
