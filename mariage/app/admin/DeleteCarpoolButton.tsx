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
  async function deleteAndRefresh(formData: FormData) {
    await deleteCarpool(formData);
    window.localStorage.setItem("carpool-offers-version", String(Date.now()));
  }

  return (
    <form
      action={deleteAndRefresh}
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
