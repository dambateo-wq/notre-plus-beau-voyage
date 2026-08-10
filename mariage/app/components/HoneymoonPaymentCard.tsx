"use client";

import { useEffect, useRef, useState } from "react";

type CopyTarget = "iban" | "reference";

type HoneymoonPaymentCardProps = {
  accountHolder: string;
  iban: string;
  bic: string;
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
}: HoneymoonPaymentCardProps) {
  const [copied, setCopied] = useState<CopyTarget | null>(null);
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
          <dt>Référence de virement recommandée</dt>
          <dd>{TRANSFER_REFERENCE}</dd>
          <p>Remplacez « Prénom Nom » par votre identité pour nous aider à reconnaître votre participation.</p>
        </div>
      </dl>

      <div className="honeymoon-copy-actions">
        <button type="button" onClick={() => copyValue("iban", iban)}>
          <span>{copied === "iban" ? "Copié" : "Copier l’IBAN"}</span>
          <i aria-hidden="true">{copied === "iban" ? "✓" : "⧉"}</i>
        </button>
        <button
          type="button"
          onClick={() => copyValue("reference", TRANSFER_REFERENCE)}
        >
          <span>{copied === "reference" ? "Copié" : "Copier la référence"}</span>
          <i aria-hidden="true">{copied === "reference" ? "✓" : "⧉"}</i>
        </button>
      </div>
      <p className="honeymoon-copy-status" aria-live="polite" aria-atomic="true">
        {copied ? "Copié" : ""}
      </p>
    </article>
  );
}
