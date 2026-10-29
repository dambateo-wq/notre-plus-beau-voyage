"use client";

import { useState, type FormEvent } from "react";
import type { AdminReservationSnapshot, AdminReservationVersion } from "@/lib/admin-reservation-edit";
import styles from "./reservation-editor.module.css";

export default function StandaloneReservationEditor({ reservation, version }: {
  reservation: AdminReservationSnapshot["reservation"]; version: AdminReservationVersion;
}) {
  const [names, setNames] = useState(reservation.guest_names.join("\n"));
  const [nights, setNights] = useState(reservation.nights);
  const [pending, setPending] = useState(false), [saved, setSaved] = useState(false), [error, setError] = useState("");
  const count = names.split("\n").map(n => n.trim()).filter(Boolean).length;
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/admin/reservations/${version.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        expectedReservationUpdatedAt: version.reservationUpdatedAt, expectedRegistrationUpdatedAt: null,
        bookerName: form.get("bookerName"), phone: form.get("phone"), email: form.get("email"),
        guestNames: names.split("\n").map(n => n.trim()).filter(Boolean), nights,
        roommateWishes: form.get("roommateWishes"), paymentMethod: form.get("paymentMethod"), bookingStatus: form.get("bookingStatus"),
      }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "La modification n’a pas pu être confirmée.");
      setSaved(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "La modification n’a pas pu être confirmée."); }
    finally { setPending(false); }
  }
  if (saved) return <p role="status">La réservation est mise à jour. <a href="/admin">Retourner à l’administration</a></p>;
  return <form onSubmit={save} className={styles.editor}>
    <label>Responsable de la réservation<input name="bookerName" required minLength={2} maxLength={80} defaultValue={reservation.booker_name} /></label>
    <label>Adresse e-mail<input name="email" type="email" maxLength={120} defaultValue={reservation.email ?? ""} /></label>
    <label>Téléphone<input name="phone" type="tel" required maxLength={30} defaultValue={reservation.phone} /></label>
    <label>Voyageurs hébergés — une personne par ligne<textarea value={names} onChange={e => setNames(e.target.value)} required rows={5} /></label>
    <fieldset><legend>Nuitées demandées</legend>{[["2027-05-28", "Vendredi 28 mai"], ["2027-05-29", "Samedi 29 mai"]].map(([date, label]) => <label key={date} className={styles.choice}>
      <input type="checkbox" checked={nights.includes(date)} onChange={() => setNights(current => current.includes(date) ? current.filter(n => n !== date) : [...current, date].sort())} />{label}
    </label>)}</fieldset>
    <p>Total : {count} personne(s) × {nights.length} nuit(s) × 35 € = <strong>{count * nights.length * 35} €</strong>.</p>
    <label>Souhaits de colocation<textarea name="roommateWishes" maxLength={500} defaultValue={reservation.roommate_wishes ?? ""} rows={3} /></label>
    <label>Moyen de paiement prévu<select name="paymentMethod" defaultValue={reservation.payment_method}><option value="wero">Wero</option><option value="bank_transfer">Virement bancaire</option><option value="later">À préciser</option></select></label>
    <label>Statut de la réservation<select name="bookingStatus" defaultValue={reservation.booking_status}><option value="active">Active</option><option value="cancelled">Annulée</option></select></label>
    <p>Le moyen de paiement ne confirme pas la réception d’argent. Une annulation libère les placements ; réactiver une réservation nécessite de replacer ses voyageurs.</p>
    {error && <p role="alert">{error} <button type="button" onClick={() => window.location.reload()}>Recharger la réservation</button></p>}
    <button type="submit" disabled={pending}>{pending ? "Enregistrement…" : "Enregistrer les modifications sans envoyer d’e-mail"}</button>
  </form>;
}
