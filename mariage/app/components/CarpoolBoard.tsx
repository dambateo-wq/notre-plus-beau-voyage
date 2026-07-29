"use client";

import { FormEvent, useEffect, useState } from "react";

type CarpoolOffer = {
  id: string;
  driver_name: string;
  direction: "to_massacan" | "from_massacan";
  other_place: string;
  departure_at: string;
  seats_available: number;
  details: string | null;
  created_at: string;
};

function journeyLabel(offer: CarpoolOffer) {
  return offer.direction === "to_massacan"
    ? `${offer.other_place} → Domaine de Massacan`
    : `Domaine de Massacan → ${offer.other_place}`;
}

function phoneHref(contact: string) {
  const phone = contact.replace(/[^\d+]/g, "");
  return /^\+?\d{8,15}$/.test(phone) ? `tel:${phone}` : null;
}

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

  useEffect(() => {
    fetch("/api/carpool")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setOffers(data);
      })
      .catch(() => {
        setError("Les trajets ne peuvent pas être affichés actuellement.");
      })
      .finally(() => setLoading(false));
  }, []);

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
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error);
      }

      setOffers((current) =>
        [...current, data.offer].sort(
          (a, b) =>
            new Date(a.departure_at).getTime() -
            new Date(b.departure_at).getTime(),
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
      setRequestStatus((current) => ({ ...current, [offerId]: "sent" }));
    } catch {
      setRequestStatus((current) => ({ ...current, [offerId]: "error" }));
    }
  }

  return (
    <section className="carpool-section" id="covoiturage">
      <div className="carpool-intro">
        <div>
          <p className="eyebrow">Voyageons ensemble</p>
          <h2>Le covoiturage des invités</h2>
          <p>
            Une place libre dans votre voiture ? Publiez votre trajet pour
            permettre à un autre invité de faire la route avec vous.
          </p>
        </div>
        <div className="carpool-how">
          <span>🚗</span>
          <p>
            Les coordonnées restent privées. Envoyez une demande de place :
            Damien et Julie vous mettront en relation avec le conducteur.
          </p>
        </div>
      </div>

      <div className="carpool-layout">
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
            <p className="carpool-success">
              Votre trajet est publié. Bonne route !
            </p>
          )}

          <button type="submit" disabled={submitting}>
            {submitting ? "Publication…" : "Publier mon trajet"}
          </button>
        </form>

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
                      {new Intl.DateTimeFormat("fr-FR", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "Europe/Paris",
                      }).format(new Date(offer.departure_at))}
                    </p>
                    <p>
                      <b>{offer.driver_name}</b>
                      {offer.details && ` · ${offer.details}`}
                    </p>
                    <button
                      className="carpool-request-toggle"
                      type="button"
                      onClick={() =>
                        setRequestingOffer((current) =>
                          current === offer.id ? null : offer.id,
                        )
                      }
                    >
                      Demander une place
                    </button>

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
