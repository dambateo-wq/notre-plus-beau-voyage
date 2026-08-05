"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Availability = {
  capacity: number;
  priceCents: number;
  availability: Record<string, number>;
};

type Reservation = {
  reference: string;
  bookerName: string;
  guestNames: string[];
  guestsCount: number;
  nights: string[];
  amountCents: number;
  paymentMethod: "wero" | "bank_transfer" | "later";
  paymentStatus: "unpaid" | "declared" | "confirmed";
  bookingStatus: "active" | "cancelled";
};

type PaymentDetails = {
  weroPhone: string;
  iban: string;
  bic: string;
  accountHolder: string;
  configured: boolean;
};

const nights = [
  { value: "2027-05-28", label: "Vendredi 28 mai" },
  { value: "2027-05-29", label: "Samedi 29 mai" },
];

function money(cents: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

function nightLabel(value: string) {
  return nights.find((night) => night.value === value)?.label ?? value;
}

export default function LodgingBooking() {
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [selectedNights, setSelectedNights] = useState<string[]>([]);
  const [guestsCount, setGuestsCount] = useState(1);
  const [guestNames, setGuestNames] = useState([""]);
  const [paymentMethod, setPaymentMethod] =
    useState<Reservation["paymentMethod"]>("later");
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [paymentDetails, setPaymentDetails] = useState<PaymentDetails | null>(
    null,
  );
  const [error, setError] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "declaring">(
    "idle",
  );
  const [lookupReference, setLookupReference] = useState("");
  const [lookupPhone, setLookupPhone] = useState("");

  useEffect(() => {
    fetch("/api/lodging")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setAvailability(data);
      })
      .catch(() =>
        setError("Les disponibilités ne peuvent pas être affichées pour le moment."),
      );
  }, []);

  const total = useMemo(
    () => guestsCount * selectedNights.length * 3500,
    [guestsCount, selectedNights],
  );

  function updateGuestsCount(nextCount: number) {
    setGuestsCount(nextCount);
    setGuestNames((current) =>
      Array.from({ length: nextCount }, (_, index) => current[index] ?? ""),
    );
  }

  function toggleNight(night: string) {
    setSelectedNights((current) =>
      current.includes(night)
        ? current.filter((item) => item !== night)
        : [...current, night].sort(),
    );
  }

  async function createReservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!selectedNights.length) {
      setError("Choisissez au moins une nuit.");
      return;
    }

    setStatus("saving");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/lodging", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookerName: form.get("bookerName"),
          phone: form.get("phone"),
          email: form.get("email"),
          guestNames,
          guestsCount,
          nights: selectedNights,
          roommateWishes: form.get("roommateWishes"),
          paymentMethod,
          website: form.get("website"),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setReservation(data.reservation);
      setPaymentDetails(data.paymentDetails);
      setLookupReference(data.reservation.reference);
      setLookupPhone(String(form.get("phone") ?? ""));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "La réservation n’a pas pu être enregistrée.",
      );
    } finally {
      setStatus("idle");
    }
  }

  async function lookupReservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      const response = await fetch("/api/lodging/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "lookup",
          reference: lookupReference,
          phone: lookupPhone,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setReservation(data.reservation);
      setPaymentDetails(data.paymentDetails);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "La réservation n’a pas pu être retrouvée.",
      );
    }
  }

  async function declarePayment(method: "wero" | "bank_transfer") {
    if (!reservation) return;
    setStatus("declaring");
    setError("");
    try {
      const response = await fetch("/api/lodging/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "declare_payment",
          reference: reservation.reference,
          phone: lookupPhone,
          paymentMethod: method,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setReservation(data.reservation);
      setPaymentDetails(data.paymentDetails);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Le paiement n’a pas pu être déclaré.",
      );
    } finally {
      setStatus("idle");
    }
  }

  return (
    <section className="lodging-section" id="hebergement">
      <div className="lodging-intro">
        <p className="eyebrow">Dormir au domaine</p>
        <h2>Réserver vos nuitées</h2>
        <p>
          35 € par personne et par nuit. La plupart des chambres comprennent
          quatre lits simples : nous formerons les chambres au plus près de vos
          souhaits.
        </p>
      </div>

      <div className="lodging-availability">
        {nights.map((night) => (
          <div key={night.value}>
            <span>{night.label}</span>
            <strong>
              {availability ? availability.availability[night.value] : "—"}{" "}
              places restantes
            </strong>
          </div>
        ))}
      </div>

      {!reservation ? (
        <div className="lodging-layout">
          <form className="lodging-form" onSubmit={createReservation}>
            <p className="eyebrow">Nouvelle réservation</p>
            <h3>Nous dormons au domaine</h3>
            <label>
              Nom et prénom de la personne qui réserve
              <input name="bookerName" maxLength={80} required />
            </label>
            <div className="lodging-form-row">
              <label>
                Téléphone
                <input name="phone" type="tel" maxLength={30} required />
              </label>
              <label>
                E-mail <span>(facultatif)</span>
                <input name="email" type="email" maxLength={120} />
              </label>
            </div>

            <fieldset>
              <legend>Les nuits réservées</legend>
              <div className="lodging-night-choices">
                {nights.map((night) => (
                  <label key={night.value}>
                    <input
                      type="checkbox"
                      checked={selectedNights.includes(night.value)}
                      onChange={() => toggleNight(night.value)}
                    />
                    <span>{night.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label>
              Nombre de personnes à loger
              <select
                value={guestsCount}
                onChange={(event) => updateGuestsCount(Number(event.target.value))}
              >
                {Array.from({ length: 12 }, (_, index) => index + 1).map(
                  (count) => (
                    <option key={count} value={count}>
                      {count} personne{count > 1 ? "s" : ""}
                    </option>
                  ),
                )}
              </select>
            </label>

            <div className="lodging-names">
              <p>Les personnes à loger</p>
              {guestNames.map((name, index) => (
                <input
                  key={index}
                  value={name}
                  onChange={(event) =>
                    setGuestNames((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? event.target.value : item,
                      ),
                    )
                  }
                  placeholder={"Nom et prénom " + (index + 1)}
                  maxLength={80}
                  required
                />
              ))}
            </div>

            <label>
              Avec qui aimeriez-vous partager votre chambre ?{" "}
              <span>(facultatif)</span>
              <textarea
                name="roommateWishes"
                maxLength={500}
                placeholder="Indiquez les personnes avec qui vous souhaiteriez être."
              />
            </label>

            <fieldset>
              <legend>Votre règlement</legend>
              <div className="lodging-payment-choices">
                <label>
                  <input
                    type="radio"
                    name="payment"
                    checked={paymentMethod === "wero"}
                    onChange={() => setPaymentMethod("wero")}
                  />
                  <span>Wero</span>
                </label>
                <label>
                  <input
                    type="radio"
                    name="payment"
                    checked={paymentMethod === "bank_transfer"}
                    onChange={() => setPaymentMethod("bank_transfer")}
                  />
                  <span>Virement bancaire</span>
                </label>
                <label>
                  <input
                    type="radio"
                    name="payment"
                    checked={paymentMethod === "later"}
                    onChange={() => setPaymentMethod("later")}
                  />
                  <span>Je paierai plus tard</span>
                </label>
              </div>
            </fieldset>
            <label className="lodging-honeypot" aria-hidden="true">
              Votre site
              <input name="website" tabIndex={-1} autoComplete="off" />
            </label>
            <p className="lodging-total">
              Total de la réservation : <strong>{money(total)}</strong>
            </p>
            {error && <p className="lodging-error">{error}</p>}
            <button type="submit" disabled={status === "saving"}>
              {status === "saving"
                ? "Réservation…"
                : "Réserver mes nuitées"}
            </button>
          </form>

          <form className="lodging-lookup" onSubmit={lookupReservation}>
            <p className="eyebrow">Déjà réservé ?</p>
            <h3>Retrouver ou régler ma réservation</h3>
            <p>Votre référence vous a été affichée après la réservation.</p>
            <label>
              Référence
              <input
                value={lookupReference}
                onChange={(event) => setLookupReference(event.target.value)}
                placeholder="NPBV-XXXXXXXX"
                required
              />
            </label>
            <label>
              Numéro de téléphone utilisé
              <input
                value={lookupPhone}
                onChange={(event) => setLookupPhone(event.target.value)}
                type="tel"
                required
              />
            </label>
            <button type="submit">Retrouver ma réservation</button>
          </form>
        </div>
      ) : (
        <ReservationSummary
          reservation={reservation}
          paymentDetails={paymentDetails}
          onDeclarePayment={declarePayment}
          declaring={status === "declaring"}
        />
      )}
    </section>
  );
}

function ReservationSummary({
  reservation,
  paymentDetails,
  onDeclarePayment,
  declaring,
}: {
  reservation: Reservation;
  paymentDetails: PaymentDetails | null;
  onDeclarePayment: (method: "wero" | "bank_transfer") => void;
  declaring: boolean;
}) {
  const [selectedMethod, setSelectedMethod] = useState<"wero" | "bank_transfer">(
    reservation.paymentMethod === "bank_transfer" ? "bank_transfer" : "wero",
  );

  return (
    <div className="lodging-confirmation">
      <span>🏡</span>
      <p className="eyebrow">Réservation enregistrée</p>
      <h3>Vos places sont mises de côté</h3>
      <p>
        Référence à conserver : <strong>{reservation.reference}</strong>
      </p>
      <dl>
        <div>
          <dt>Nuitées</dt>
          <dd>{reservation.nights.map(nightLabel).join(" · ")}</dd>
        </div>
        <div>
          <dt>Personnes</dt>
          <dd>{reservation.guestsCount}</dd>
        </div>
        <div>
          <dt>Montant</dt>
          <dd>{money(reservation.amountCents)}</dd>
        </div>
      </dl>

      {reservation.paymentStatus === "confirmed" ? (
        <p className="lodging-paid">Paiement confirmé. Merci !</p>
      ) : reservation.paymentStatus === "declared" ? (
        <p className="lodging-declared">
          Paiement déclaré. Nous le vérifierons prochainement.
        </p>
      ) : paymentDetails?.configured ? (
        <div className="lodging-payment-details">
          <div className="lodging-payment-switch">
            <button
              type="button"
              className={selectedMethod === "wero" ? "selected" : ""}
              onClick={() => setSelectedMethod("wero")}
            >
              Wero
            </button>
            <button
              type="button"
              className={selectedMethod === "bank_transfer" ? "selected" : ""}
              onClick={() => setSelectedMethod("bank_transfer")}
            >
              Virement
            </button>
          </div>
          {selectedMethod === "wero" ? (
            <p>
              Envoyez <strong>{money(reservation.amountCents)}</strong> via
              Wero au <strong>{paymentDetails.weroPhone}</strong>, avec la
              référence <strong>{reservation.reference}</strong>.
            </p>
          ) : (
            <dl>
              <div>
                <dt>Titulaire</dt>
                <dd>{paymentDetails.accountHolder}</dd>
              </div>
              <div>
                <dt>IBAN</dt>
                <dd>{paymentDetails.iban}</dd>
              </div>
              <div>
                <dt>BIC</dt>
                <dd>{paymentDetails.bic}</dd>
              </div>
              <div>
                <dt>Libellé</dt>
                <dd>{reservation.reference}</dd>
              </div>
            </dl>
          )}
          <button
            type="button"
            onClick={() => onDeclarePayment(selectedMethod)}
            disabled={declaring}
          >
            {declaring ? "Enregistrement…" : "J’ai effectué le paiement"}
          </button>
        </div>
      ) : (
        <p className="lodging-error">
          Les informations de paiement seront disponibles très prochainement.
        </p>
      )}
    </div>
  );
}
