"use client";

import { useFormStatus } from "react-dom";
import { deleteCarpool } from "./actions";
import styles from "./admin.module.css";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button className={styles.deleteButton} type="submit" disabled={pending}>
      {pending ? "Suppression…" : "Supprimer"}
    </button>
  );
}

export default function DeleteCarpoolButton({
  id,
  name,
}: {
  id: string;
  name: string;
}) {
  return (
    <form
      action={deleteCarpool}
      onSubmit={(event) => {
        if (
          !window.confirm(
            `Supprimer définitivement le trajet proposé par ${name} ?`,
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
