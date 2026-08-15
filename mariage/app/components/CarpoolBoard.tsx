"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { formatCarpoolDate } from "@/lib/carpool-time";
import {
  normalizePublicCarpoolOffers,
  type PublicCarpoolOffer as CarpoolOffer,
} from "@/lib/carpool-public";

function journeyLabel(offer: CarpoolOffer) {
  return offer.direction === "to_massacan"
    ? `${offer.other_place} → Domaine de Massacan`
    : `Domaine de Massacan → ${offer.other_place}`;
}

function phoneHref(contact: string) {
  const phone = contact.replace(/[^\d+]/g, "");
  return /^\+?\d{8,15}$/.test(phone) ? `tel:${phone}` : null;
}

const CARPOOL_REFRESH_KEY = "carpool-offers-version";

export default function CarpoolBoard() {
  const [offers, setOffers] = useState<CarpoolOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [direction, setDirection] = useState("to_massacan");
  const [requestingOffer, setRequestingOffer] = useState<string | null>(null);
  const [requestStatus, setRequestStatus] = useState<Record<string, string>>(
    {},
  );
  const [driverContacts, setDriverContacts] = useState<Record<string, string>>(
    {},
  );
  const requestVersion = useRef(0);

  const loadOffers = useCallback(async (initial = false) => {
    const version = ++requestVersion.current;
    try {
      const response = await fetch(`/api/carpool?fresh=${Date.now()}`, {
        cache: "no-store",
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        const message =
          data && typeof data === "object" && "error" in data
            ? String(data.error)
            : "Les trajets sont indisponibles.";
        throw new Error(message);
      }
      if (version === requestVersion.current) {
        setOffers(normalizePublicCarpoolOffers(data));
      }
    } catch {
      if (initial) {
        setError("Les trajets ne peuvent pas être affichés actuellement.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadOffers(true), 0);

    const refresh = () => void loadOffers();
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const refreshFromStorage = (event: StorageEvent) => {
      if (event.key === CARPOOL_REFRESH_KEY) refresh();
    };
    const interval = window.setInterval(refresh, 15_000);

    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    window.addEventListener("storage", refreshFromStorage);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
      window.removeEventListener("storage", refreshFromStorage);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [loadOffers]);

  async function submitOffer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setSuccess(false);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      driverName: formData.get("driverName"),
      direction: formData.get("direction"),
      otherPlace: formData.get("otherPlace"),
      departureAt: formData.get("departureAt"),
      seatsAvailable: Number(formData.get("seatsAvailable")),
      contact: formData.get("contact"),
      details: formData.get("details"),
      website: formData.get("website"),
    };

    try {
      const response = await fetch("/api/carpool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        const message =
          data && typeof data === "object" && "error" in data
            ? String(data.error)
            : "Le trajet n’a pas pu être publié.";
        throw new Error(message);
      }

      const createdOffer =
        data && typeof data === "object" && "offer" in data
          ? normalizePublicCarpoolOffers([data.offer])[0]
          : undefined;
      if (!createdOffer) throw new Error("La réponse du serveur est incomplète.");

      setOffers((current) =>
        [...current, createdOffer].sort((a, b) =>
          a.departure_local.localeCompare(b.departure_local),
        ),
      );
      form.reset();
      setDirection("to_massacan");
      setSuccess(true);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Le trajet n’a pas pu être publié.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function requestSeat(
    event: FormEvent<HTMLFormElement>,
    offerId: string,
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setRequestStatus((current) => ({ ...current, [offerId]: "sending" }));

    try {
      const response = await fetch("/api/carpool/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offerId,
          passengerName: formData.get("passengerName"),
          passengerContact: formData.get("passengerContact"),
          seatsRequested: Number(formData.get("seatsRequested")),
          message: formData.get("message"),
          website: formData.get("website"),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (!data.driverContact) {
        throw new Error("Le numéro du conducteur n’a pas été reçu.");
      }
      form.reset();
      setDriverContacts((current) => ({
        ...current,
        [offerId]: data.driverContact,
      }));
      setOffers((current) => current.map((offer) => {
        if (offer.id !== offerId) return offer;
        const requested = Number(formData.get("seatsRequested"));
        let remaining = requested;
        return {
          ...offer,
          seats_available: Number(data.remainingSeats),
          carpool_seats: offer.carpool_seats.map((seat) => {
            if (remaining > 0 && seat.status === "free") {
              remaining -= 1;
              return { ...seat, status: "reserved" as const };
            }
            return seat;
          }),
        };
      }));
      setRequestStatus((current) => ({ ...current, [offerId]: "sent" }));
    } catch {
      setRequestStatus((current) => ({ ...current, [offerId]: "error" }));
    }
  }

  return (
    <section className="carpool-section" id="covoiturage">
      <div className="carpool-intro">
        <div>
          <p className="eyebrow"><span className="v2-section-number">02</span> Covoiturage</p>
          <h2>Le covoiturage des invités</h2>
          <p>
            Une place libre dans votre voiture ? Publiez votre trajet pour
            permettre à un autre invité de faire la route avec vous.
          </p>
        </div>
      </div>

      <div className="carpool-layout">
        <div className="carpool-form-stack">
          <form className="carpool-form" onSubmit={submitOffer}>
          <p className="eyebrow">Proposer un trajet</p>
          <h3>J’ai de la place dans ma voiture</h3>

          <label>
            Votre nom et prénom
            <input
              name="driverName"
              type="text"
              maxLength={80}
              autoComplete="name"
              required
            />
          </label>

          <label>
            Sens du trajet
            <select
              name="direction"
              value={direction}
              onChange={(event) => setDirection(event.target.value)}
              required
            >
              <option value="to_massacan">Vers le Domaine de Massacan</option>
              <option value="from_massacan">Retour depuis le domaine</option>
            </select>
          </label>

          <label>
            {direction === "to_massacan"
              ? "Ville ou lieu de départ"
              : "Ville ou destination d’arrivée"}
            <input
              name="otherPlace"
              type="text"
              maxLength={140}
              placeholder={
                direction === "to_massacan"
                  ? "Ex. Toulon, gare SNCF"
                  : "Ex. Hyères centre"
              }
              required
            />
          </label>

          <div className="carpool-form-row">
            <label>
              Date et heure de départ
              <input
                name="departureAt"
                type="datetime-local"
                min="2027-05-25T00:00"
                max="2027-06-02T23:59"
                defaultValue="2027-05-28T10:00"
                required
              />
            </label>
            <label>
              Places disponibles
              <select name="seatsAvailable" defaultValue="1" required>
                {Array.from({ length: 8 }, (_, index) => index + 1).map(
                  (count) => (
                    <option value={count} key={count}>
                      {count} place{count > 1 ? "s" : ""}
                    </option>
                  ),
                )}
              </select>
            </label>
          </div>

          <label>
            Numéro de téléphone
            <input
              name="contact"
              type="tel"
              maxLength={120}
              placeholder="Visible après une demande de place"
              autoComplete="tel"
              required
            />
          </label>

          <label>
            Précisions utiles <span>(facultatif)</span>
            <textarea
              name="details"
              maxLength={500}
              placeholder="Point de rendez-vous, détour possible, bagages…"
            />
          </label>

          <label className="carpool-honeypot" aria-hidden="true">
            Votre site
            <input name="website" type="text" tabIndex={-1} autoComplete="off" />
          </label>

          {error && <p className="carpool-error">{error}</p>}
          {success && (
            <div className="carpool-success">
              <strong>Votre trajet est publié.</strong>{" "}
              Vous pourrez le modifier depuis le bouton affiché sur son annonce.
            </div>
          )}

          <button type="submit" disabled={submitting}>
            {submitting ? "Publication…" : "Publier mon trajet"}
          </button>
          </form>
        </div>

        <div className="carpool-offers">
          <div className="carpool-offers-heading">
            <div>
              <p className="eyebrow">Trajets disponibles</p>
              <h3>Montez à bord</h3>
            </div>
            <span>
              {offers.length} trajet{offers.length > 1 ? "s" : ""}
            </span>
          </div>

          {loading ? (
            <p className="carpool-empty">Chargement des trajets…</p>
          ) : offers.length === 0 ? (
            <p className="carpool-empty">
              Aucun trajet n’a encore été proposé. Soyez le premier à prendre
              la route !
            </p>
          ) : (
            <div className="carpool-list">
              {offers.map((offer) => {
                return (
                  <article className="carpool-offer" key={offer.id}>
                    <div className="carpool-offer-top">
                      <span>
                        {offer.direction === "to_massacan"
                          ? "Vers le mariage"
                          : "Retour"}
                      </span>
                      <strong>
                        {offer.seats_available} place
                        {offer.seats_available > 1 ? "s" : ""}
                      </strong>
                    </div>
                    <h4>{journeyLabel(offer)}</h4>
                    <p className="carpool-date">
                      {formatCarpoolDate(offer.departure_local)}
                    </p>
                    <p>
                      <b>{offer.driver_name}</b>
                      {offer.details && ` · ${offer.details}`}
                    </p>
                    <div className="carpool-public-seats" aria-label={`${offer.seats_available} places libres sur ${offer.seats_total}`}>
                      {offer.carpool_seats.map((seat) => (
                        <span
                          className={`carpool-seat-dot seat-${seat.status}`}
                          key={seat.id}
                          title={`Place ${seat.position} : ${seat.status === "free" ? "libre" : seat.status === "reserved" ? "réservée" : "validée"}`}
                        >
                          <span className="sr-only">Place {seat.position} : {seat.status}</span>
                        </span>
                      ))}
                    </div>
                    <button
                      className="carpool-request-toggle"
                      type="button"
                      disabled={offer.seats_available === 0}
                      onClick={() =>
                        setRequestingOffer((current) =>
                          current === offer.id ? null : offer.id,
                        )
                      }
                    >
                      {offer.seats_available > 0 ? "Demander une place" : "Trajet complet"}
                    </button>
                    <a
                      className="carpool-manage-link"
                      href={`/carpool/manage/${offer.id}`}
                    >
                      Je suis le conducteur, je veux gérer mon annonce
                    </a>

                    {requestingOffer === offer.id && (
                      <form
                        className="carpool-request-form"
                        onSubmit={(event) => requestSeat(event, offer.id)}
                      >
                        <label>
                          Votre nom et prénom
                          <input
                            name="passengerName"
                            type="text"
                            maxLength={80}
                            required
                          />
                        </label>
                        <label>
                          Votre numéro de téléphone
                          <input
                            name="passengerContact"
                            type="tel"
                            maxLength={120}
                            autoComplete="tel"
                            required
                          />
                        </label>
                        <label>
                          Nombre de places souhaitées
                          <select
                            name="seatsRequested"
                            defaultValue="1"
                            required
                          >
                            {Array.from(
                              { length: offer.seats_available },
                              (_, index) => index + 1,
                            ).map((count) => (
                              <option value={count} key={count}>
                                {count}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Message <span>(facultatif)</span>
                          <textarea
                            name="message"
                            maxLength={300}
                            placeholder="Précisez votre point de rendez-vous si besoin."
                          />
                        </label>
                        <label className="carpool-honeypot" aria-hidden="true">
                          Votre site
                          <input
                            name="website"
                            type="text"
                            tabIndex={-1}
                            autoComplete="off"
                          />
                        </label>
                        {requestStatus[offer.id] === "sent" ? (
                          <div
                            className="carpool-contact-reveal"
                            role="status"
                          >
                            <p>
                              Demande envoyée ! Le numéro n’est pas envoyé par
                              SMS : il s’affiche ici pour contacter directement
                              le conducteur.
                            </p>
                            {phoneHref(driverContacts[offer.id] ?? "") ? (
                              <a
                                href={phoneHref(driverContacts[offer.id]) ?? "#"}
                              >
                                📞 {driverContacts[offer.id]}
                              </a>
                            ) : (
                              <strong>{driverContacts[offer.id]}</strong>
                            )}
                          </div>
                        ) : (
                          <>
                            {requestStatus[offer.id] === "error" && (
                              <p className="carpool-error">
                                La demande n’a pas pu être envoyée.
                              </p>
                            )}
                            <button
                              type="submit"
                              disabled={
                                requestStatus[offer.id] === "sending"
                              }
                            >
                              {requestStatus[offer.id] === "sending"
                                ? "Envoi…"
                                : "Envoyer ma demande"}
                            </button>
                          </>
                        )}
                      </form>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
