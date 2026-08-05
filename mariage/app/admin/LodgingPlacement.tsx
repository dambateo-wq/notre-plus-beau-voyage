"use client";

import { useState, useTransition } from "react";
import { saveLodgingPlacement } from "./actions";
import { LODGING_ROOMS } from "@/lib/lodging-rooms";
import styles from "./admin.module.css";

type Assignment = {
  room_name: string;
  friday_adults: number;
  friday_children: number;
  friday_babies: number;
  saturday_adults: number;
  saturday_children: number;
  saturday_babies: number;
};

export default function LodgingPlacement({
  reservationId,
  guestsCount,
  nights,
  assignment,
}: {
  reservationId: string;
  guestsCount: number;
  nights: string[];
  assignment?: Assignment;
}) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(Boolean(assignment));
  const friday = nights.includes("2027-05-28");
  const saturday = nights.includes("2027-05-29");

  function submit(formData: FormData) {
    formData.set("id", reservationId);
    startTransition(async () => {
      await saveLodgingPlacement(formData);
      setOpen(false);
    });
  }

  if (!open) {
    return <button className={styles.placeButton} onClick={() => setOpen(true)} type="button">Placer dans une chambre</button>;
  }

  return (
    <form className={styles.placementForm} action={submit}>
      <label>Chambre
        <select name="roomName" defaultValue={assignment?.room_name ?? ""} required>
          <option value="" disabled>Choisir une chambre</option>
          {LODGING_ROOMS.map((room) => <option key={room.name} value={room.name}>{room.name} · {room.capacity} pers.</option>)}
        </select>
      </label>
      {friday && <fieldset><legend>Vendredi</legend><Counts prefix="friday" defaults={assignment ? [assignment.friday_adults, assignment.friday_children, assignment.friday_babies] : [guestsCount, 0, 0]} /></fieldset>}
      {saturday && <fieldset><legend>Samedi</legend><Counts prefix="saturday" defaults={assignment ? [assignment.saturday_adults, assignment.saturday_children, assignment.saturday_babies] : [guestsCount, 0, 0]} /></fieldset>}
      <div><button className={styles.confirmButton} disabled={pending} type="submit">{pending ? "Enregistrement…" : "Enregistrer le placement"}</button><button className={styles.cancelButton} onClick={() => setOpen(false)} type="button">Fermer</button></div>
    </form>
  );
}

function Counts({ prefix, defaults }: { prefix: string; defaults: number[] }) {
  return <div className={styles.countInputs}>
    {["Adultes", "Enfants", "Bébés"].map((label, index) => <label key={label}>{label}<input defaultValue={defaults[index]} min="0" name={prefix + ["Adults", "Children", "Babies"][index]} type="number" /></label>)}
  </div>;
}
