"use client";

import { useTransition } from "react";
import { reviewLodgingModification } from "./actions";
import styles from "./admin.module.css";

function money(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}

export default function LodgingChangeReview({
  change,
}: {
  change: { id: string; old_amount_cents: number; new_amount_cents: number; difference_cents: number };
}) {
  const [pending, startTransition] = useTransition();

  function review(decision: "approved" | "refused") {
    if (decision === "refused" && !window.confirm("Refuser cette modification et conserver l’ancienne réservation ?")) return;
    const formData = new FormData();
    formData.set("changeId", change.id);
    formData.set("decision", decision);
    startTransition(() => reviewLodgingModification(formData));
  }

  return (
    <div className={styles.financialReview}>
      <strong>Modification après paiement — à valider</strong>
      <dl>
        <div><dt>Ancien montant</dt><dd>{money(change.old_amount_cents)}</dd></div>
        <div><dt>Nouveau montant</dt><dd>{money(change.new_amount_cents)}</dd></div>
        <div><dt>Écart</dt><dd>{change.difference_cents >= 0 ? "+" : ""}{money(change.difference_cents)}</dd></div>
      </dl>
      <div>
        <button type="button" disabled={pending} onClick={() => review("approved")}>{pending ? "Validation…" : "Valider la modification"}</button>
        <button type="button" disabled={pending} onClick={() => review("refused")}>Refuser la modification</button>
      </div>
    </div>
  );
}
