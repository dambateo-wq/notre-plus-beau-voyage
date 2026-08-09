"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { formatCarpoolDate } from "@/lib/carpool-time";

type Seat = {
  id: string;
  position: number;
  status: "free" | "reserved" | "validated";
  passenger_name: string | null;
  passenger_contact: string | null;
  passenger_message: string | null;
};

type Offer = {
  driver_name: string;
  direction: "to_massacan" | "from_massacan";
  other_place: string;
  departure_local: string;
  seats_available: number;
  seats_total: number;
  contact: string;
  details: string | null;
  carpool_seats: Seat[];
};

async function fetchOffer(offerId: string) {
  const response = await fetch(`/api/carpool/manage/${offerId}`, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data.offer as Offer;
}

export default function CarpoolManager({ offerId }: { offerId: string }) {
  const [offer, setOffer] = useState<Offer | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [deleted, setDeleted] = useState(false);

  useEffect(() => {
    let active = true;
    async function bootstrap() {
      try {
        const nextOffer = await fetchOffer(offerId);
        if (active) setOffer(nextOffer);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Lien invalide.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void bootstrap();
    return () => { active = false; };
  }, [offerId]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(""); setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/carpool/manage/${offerId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form)),
    });
    const data = await response.json();
    if (!response.ok) return setError(data.error);
    setOffer(await fetchOffer(offerId));
    setMessage("Les modifications sont enregistrées.");
  }

  async function cycleSeat(seatId: string) {
    setMessage(""); setError("");
    const response = await fetch(`/api/carpool/manage/${offerId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cycle-seat", seatId }),
    });
    const data = await response.json();
    if (!response.ok) return setError(data.error);
    setOffer(await fetchOffer(offerId));
  }

  async function removeOffer() {
    if (!window.confirm("Supprimer définitivement cette annonce ?")) return;
    const response = await fetch(`/api/carpool/manage/${offerId}`, { method: "DELETE" });
    if (!response.ok) return setError("L’annonce n’a pas pu être supprimée.");
    setDeleted(true);
  }

  if (loading) return <main className="carpool-manage-page"><p>Chargement de votre trajet…</p></main>;
  if (deleted) return <main className="carpool-manage-page"><section className="carpool-manager"><h1>Annonce supprimée</h1><p>Votre trajet n’est plus visible sur le site.</p><Link href="/#covoiturage">Retour au covoiturage</Link></section></main>;
  if (!offer) return <main className="carpool-manage-page"><section className="carpool-manager"><h1>Lien indisponible</h1><p>{error || "Cette annonce n’existe plus."}</p><Link href="/">Retour au site</Link></section></main>;

  return (
    <main className="carpool-manage-page">
      <section className="carpool-manager">
        <p className="eyebrow">Espace conducteur</p>
        <h1>Gérer mon trajet</h1>
        <p className="carpool-manager-intro">{formatCarpoolDate(offer.departure_local, true)} · {offer.seats_available} place{offer.seats_available > 1 ? "s" : ""} libre{offer.seats_available > 1 ? "s" : ""}</p>

        <div className="carpool-seat-manager" aria-label="Gestion des places">
          <div className="carpool-seat-legend"><span><i className="seat-free" /> Libre</span><span><i className="seat-reserved" /> Réservée</span><span><i className="seat-validated" /> Validée</span></div>
          <div className="carpool-seat-list">
            {offer.carpool_seats.map((seat) => (
              <button key={seat.id} type="button" className={`carpool-seat seat-${seat.status}`} onClick={() => cycleSeat(seat.id)} aria-label={`Place ${seat.position}, ${seat.status}. Modifier le statut.`}>
                <strong>{seat.position}</strong>
                <span>{seat.passenger_name || (seat.status === "free" ? "Libre" : "Réservation manuelle")}</span>
                {seat.passenger_contact && <small>{seat.passenger_contact}</small>}
              </button>
            ))}
          </div>
          <p className="carpool-seat-help">Touchez une place pour la faire passer de libre à réservée, puis validée, puis libre.</p>
        </div>

        <form className="carpool-manager-form" onSubmit={save}>
          <label>Nom et prénom<input name="driverName" defaultValue={offer.driver_name} required /></label>
          <label>Sens<select name="direction" defaultValue={offer.direction}><option value="to_massacan">Vers le Domaine de Massacan</option><option value="from_massacan">Retour depuis le domaine</option></select></label>
          <label>Ville ou lieu<input name="otherPlace" defaultValue={offer.other_place} required /></label>
          <label>Date et heure<input name="departureAt" type="datetime-local" min="2027-05-25T00:00" max="2027-06-02T23:59" defaultValue={offer.departure_local.slice(0, 16)} required /></label>
          <label>Téléphone<input name="contact" type="tel" defaultValue={offer.contact} required /></label>
          <label>Précisions<textarea name="details" defaultValue={offer.details ?? ""} /></label>
          {error && <p className="carpool-error" role="alert">{error}</p>}
          {message && <p className="carpool-success" role="status">{message}</p>}
          <button type="submit">Enregistrer les modifications</button>
        </form>
        <div className="carpool-manager-actions"><Link href="/#covoiturage">← Retour au site</Link><button type="button" onClick={removeOffer}>Supprimer l’annonce</button></div>
      </section>
    </main>
  );
}
