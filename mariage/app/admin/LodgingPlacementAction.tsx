"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reopenLodgingPlacement } from "./actions";
import styles from "./admin.module.css";

export default function LodgingPlacementAction({
  reservationId,
}: {
  reservationId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [refreshRequired, setRefreshRequired] = useState(false);
  const router = useRouter();

  function reopen() {
    setError("");
    setRefreshRequired(false);
    const formData = new FormData();
    formData.set("reservationId", reservationId);
    startTransition(async () => {
      try {
        const outcome = await reopenLodgingPlacement(formData);
        if (!outcome.ok) {
          setError(outcome.error); setRefreshRequired(Boolean(outcome.refreshRequired)); return;
        }
        router.refresh();
        window.requestAnimationFrame(() => {
          document.getElementById("guest-planner-title")?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        });
      } catch {
        setError("La connexion a été interrompue. Actualisez le plan pour vérifier son état.");
        setRefreshRequired(true);
      }
    });
  }

  return (
    <div className={styles.placementModifyAction}>
      <button
        className={styles.placementStatusLink}
        disabled={pending}
        onClick={reopen}
        type="button"
      >
        {pending ? "Ouverture…" : "Modifier le placement"}
      </button>
      {error && <small role="alert">{error}</small>}
      {refreshRequired && <button className={styles.placementStatusLink} type="button" disabled={pending} onClick={() => router.refresh()}>Actualiser le plan</button>}
    </div>
  );
}
