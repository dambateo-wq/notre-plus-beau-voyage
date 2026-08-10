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
  const router = useRouter();

  function reopen() {
    setError("");
    const formData = new FormData();
    formData.set("reservationId", reservationId);
    startTransition(async () => {
      try {
        await reopenLodgingPlacement(formData);
        router.refresh();
        window.requestAnimationFrame(() => {
          document.getElementById("guest-planner-title")?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        });
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Le placement ne peut pas être rouvert.",
        );
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
    </div>
  );
}
