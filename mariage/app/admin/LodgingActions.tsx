"use client";

import { useTransition } from "react";
import { updateLodging } from "./actions";
import styles from "./admin.module.css";

export default function LodgingActions({
  id,
  paymentStatus,
}: {
  id: string;
  paymentStatus: "unpaid" | "declared" | "confirmed";
}) {
  const [pending, startTransition] = useTransition();

  function submit(action: "confirm" | "cancel") {
    if (
      action === "cancel" &&
      !window.confirm("Annuler cette réservation ? Les places seront libérées.")
    ) {
      return;
    }

    const formData = new FormData();
    formData.set("id", id);
    formData.set("action", action);
    startTransition(() => updateLodging(formData));
  }

  return (
    <div className={styles.lodgingActions}>
      {paymentStatus !== "confirmed" && (
        <button
          className={styles.confirmButton}
          disabled={pending}
          onClick={() => submit("confirm")}
          type="button"
        >
          {pending ? "Mise à jour…" : "Confirmer le paiement"}
        </button>
      )}
      <button
        className={styles.cancelButton}
        disabled={pending}
        onClick={() => submit("cancel")}
        type="button"
      >
        Annuler la réservation
      </button>
    </div>
  );
}
