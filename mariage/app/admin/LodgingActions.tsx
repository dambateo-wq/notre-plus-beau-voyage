"use client";

import { useState, useTransition } from "react";
import { deleteLodging, updateLodging } from "./actions";
import styles from "./admin.module.css";

export default function LodgingActions({
  id,
  paymentStatus,
  bookingStatus,
}: {
  id: string;
  paymentStatus: "unpaid" | "declared" | "confirmed";
  bookingStatus: "active" | "cancelled";
}) {
  const [pending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<"confirm" | "cancel" | "delete" | null>(null);

  function submit(action: "confirm" | "cancel" | "delete") {
    if (
      action === "cancel" &&
      !window.confirm("Annuler cette réservation ? Les places seront libérées.")
    ) {
      return;
    }

    if (
      action === "delete" &&
      !window.confirm(
        "Supprimer définitivement cette réservation ? Elle disparaîtra de l’espace admin et tous ses placements seront supprimés. Cette action est irréversible.",
      )
    ) {
      return;
    }

    const formData = new FormData();
    formData.set("id", id);
    setPendingAction(action);
    startTransition(async () => {
      try {
        if (action === "delete") {
          await deleteLodging(formData);
          return;
        }
        formData.set("action", action);
        await updateLodging(formData);
      } finally {
        setPendingAction(null);
      }
    });
  }

  return (
    <div className={styles.lodgingActions}>
      {bookingStatus === "active" && paymentStatus !== "confirmed" && (
        <button
          className={styles.confirmButton}
          disabled={pending}
          onClick={() => submit("confirm")}
          type="button"
        >
          {pendingAction === "confirm" ? "Mise à jour…" : "Confirmer le paiement"}
        </button>
      )}
      {bookingStatus === "active" && (
        <button
          className={styles.cancelButton}
          disabled={pending}
          onClick={() => submit("cancel")}
          type="button"
        >
          {pendingAction === "cancel" ? "Annulation…" : "Annuler la réservation"}
        </button>
      )}
      <button
        className={styles.deleteButton}
        disabled={pending}
        onClick={() => submit("delete")}
        type="button"
      >
        {pendingAction === "delete" ? "Suppression…" : "Supprimer la réservation"}
      </button>
    </div>
  );
}
