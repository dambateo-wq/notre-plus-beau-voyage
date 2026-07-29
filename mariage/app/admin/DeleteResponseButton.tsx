"use client";

import { useFormStatus } from "react-dom";
import { deleteResponse } from "./actions";
import styles from "./admin.module.css";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button className={styles.deleteButton} type="submit" disabled={pending}>
      {pending ? "Suppression…" : "Supprimer"}
    </button>
  );
}

export default function DeleteResponseButton({
  id,
  name,
}: {
  id: string;
  name: string;
}) {
  return (
    <form
      action={deleteResponse}
      onSubmit={(event) => {
        if (
          !window.confirm(
            `Supprimer définitivement la réponse de ${name} ? Cette action supprimera aussi son vélo de la carte.`,
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <SubmitButton />
    </form>
  );
}
