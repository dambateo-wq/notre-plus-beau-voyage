"use client";

import { FormEvent, useMemo, useRef, useState } from "react";

type Place = {
  label: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
};

export type SurveyData = {
  respondentName: string;
  respondentEmail: string;
  companions: string[];
  attendanceDays: string[];
  notAttending: boolean;
  departureCity: string;
  departureCountry: string;
  latitude: number | null;
  longitude: number | null;
  phone: string;
  lodgingGuestNames: string[];
  lodgingNights: string[];
  roommateWishes: string;
  paymentMethod: "wero" | "bank_transfer" | "later";
  songs: string[];
};

type SubmitResult = {
  error?: string;
  manageUrl?: string;
  emailSent?: boolean;
  pendingValidation?: boolean;
  previousAmountCents?: number | null;
  newAmountCents?: number;
};

const attendanceOptions = [
  { value: "2027-05-28", label: "Vendredi 28 mai 2027" },
  { value: "2027-05-29", label: "Samedi 29 mai 2027" },
  { value: "2027-05-30", label: "Dimanche 30 mai 2027" },
];

const lodgingNights = [
  { value: "2027-05-28", label: "Vendredi 28 mai" },
  { value: "2027-05-29", label: "Samedi 29 mai" },
];

const emptyData: SurveyData = {
  respondentName: "",
  respondentEmail: "",
  companions: [],
  attendanceDays: [],
  notAttending: false,
  departureCity: "",
  departureCountry: "",
  latitude: null,
  longitude: null,
  phone: "",
  lodgingGuestNames: [],
  lodgingNights: [],
  roommateWishes: "",
  paymentMethod: "later",
  songs: [""],
};

function money(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}

function matchingGuestIndexes(guestNames: string[], participants: string[]) {
  const used = new Set<number>();
  return guestNames.flatMap((name) => {
    const index = participants.findIndex((participant, participantIndex) => participant === name && !used.has(participantIndex));
    if (index < 0) return [];
    used.add(index);
    return [index];
  });
}

function placeInputValue(place: Place) {
  return `${place.city}, ${place.country}`;
}

export default function WeddingSurvey({
  initialData,
  manageToken,
}: {
  initialData?: SurveyData;
  manageToken?: string;
}) {
  const source = initialData ?? emptyData;
  const [respondentName, setRespondentName] = useState(source.respondentName);
  const [respondentEmail, setRespondentEmail] = useState(source.respondentEmail);
  const [companions, setCompanions] = useState<string[]>(source.companions);
  const [attendanceDays, setAttendanceDays] = useState<string[]>(source.attendanceDays);
  const [notAttending, setNotAttending] = useState(source.notAttending);
  const [locationQuery, setLocationQuery] = useState(
    source.departureCity && source.departureCountry ? `${source.departureCity}, ${source.departureCountry}` : "",
  );
  const [places, setPlaces] = useState<Place[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(
    source.departureCity && source.departureCountry && source.latitude !== null && source.longitude !== null
      ? { label: `${source.departureCity}, ${source.departureCountry}`, city: source.departureCity, country: source.departureCountry, latitude: source.latitude, longitude: source.longitude }
      : null,
  );
  const [searching, setSearching] = useState(false);
  const locationSearchVersion = useRef(0);
  const [lodgingChoice, setLodgingChoice] = useState<"" | "yes" | "no">(
    source.lodgingNights.length ? "yes" : initialData ? "no" : "",
  );
  const [selectedNights, setSelectedNights] = useState<string[]>(source.lodgingNights);
  const initialParticipants = [source.respondentName, ...source.companions];
  const [lodgingGuestIndexes, setLodgingGuestIndexes] = useState<number[]>(
    matchingGuestIndexes(source.lodgingGuestNames, initialParticipants),
  );
  const [phone, setPhone] = useState(source.phone);
  const [roommateWishes, setRoommateWishes] = useState(source.roommateWishes);
  const [paymentMethod, setPaymentMethod] = useState<SurveyData["paymentMethod"]>(source.paymentMethod);
  const [songs, setSongs] = useState<string[]>(source.songs.length ? source.songs : [""]);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "declined">("idle");
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [error, setError] = useState("");

  const participants = useMemo(
    () => [respondentName, ...companions].map((name, index) => ({ index, name: name.trim() })),
    [respondentName, companions],
  );
  const selectedGuestNames = participants
    .filter((participant) => participant.name && lodgingGuestIndexes.includes(participant.index))
    .map((participant) => participant.name);
  const lodgingTotal = selectedGuestNames.length * selectedNights.length * 35;
  const cleanSongs = useMemo(() => songs.map((song) => song.trim()).filter(Boolean), [songs]);

  function toggleAttendance(day: string) {
    setNotAttending(false);
    setAttendanceDays((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day]);
  }

  function declineInvitation() {
    setNotAttending(true);
    setAttendanceDays([]);
    setLodgingChoice("no");
    setSelectedNights([]);
    setLodgingGuestIndexes([]);
  }

  function removeCompanion(index: number) {
    const participantIndex = index + 1;
    setCompanions((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setLodgingGuestIndexes((current) =>
      current.filter((item) => item !== participantIndex).map((item) => item > participantIndex ? item - 1 : item),
    );
  }

  async function searchLocation() {
    const searchVersion = ++locationSearchVersion.current;
    const query = locationQuery.trim();
    setError("");
    setSelectedPlace(null);
    setPlaces([]);
    if (query.length < 3) {
      setError("Indique une ville et un pays.");
      return;
    }
    setSearching(true);
    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (searchVersion !== locationSearchVersion.current) return;
      setPlaces(data.places ?? []);
      if (!data.places?.length) setError("Aucun lieu trouvé. Ajoute le pays à ta recherche.");
    } catch (searchError) {
      if (searchVersion !== locationSearchVersion.current) return;
      setError(searchError instanceof Error ? searchError.message : "La recherche n’a pas fonctionné.");
    } finally {
      if (searchVersion === locationSearchVersion.current) setSearching(false);
    }
  }

  function choosePlace(place: Place) {
    setSelectedPlace(place);
    setLocationQuery(placeInputValue(place));
    setPlaces([]);
    setError("");
  }

  function changeLocationQuery(value: string) {
    locationSearchVersion.current += 1;
    setLocationQuery(value);
    setSelectedPlace(null);
    setPlaces([]);
    setSearching(false);
  }

  function toggleNight(night: string) {
    setSelectedNights((current) => current.includes(night) ? current.filter((item) => item !== night) : [...current, night].sort());
  }

  async function submitResponse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!respondentName.trim()) return setError("Indique ton nom et ton prénom.");
    if (!notAttending && attendanceDays.length === 0) return setError("Sélectionne au moins une journée.");
    if (!notAttending && (!selectedPlace || locationQuery !== placeInputValue(selectedPlace))) {
      return setError("Recherche puis sélectionne ta ville de départ.");
    }
    if (!notAttending && !lodgingChoice) return setError("Indique si tu souhaites dormir sur place.");
    if (lodgingChoice === "yes" && (!selectedNights.length || !selectedGuestNames.length)) {
      return setError("Choisis au moins une personne et une nuit pour l’hébergement.");
    }
    if (lodgingChoice === "yes" && phone.replace(/\D/g, "").length < 8) {
      return setError("Indique un numéro de téléphone valide pour la réservation.");
    }

    setStatus("submitting");
    try {
      const response = await fetch(manageToken ? `/api/rsvp/manage/${manageToken}` : "/api/rsvp", {
        method: manageToken ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          respondentName,
          respondentEmail,
          companions,
          attendanceDays,
          notAttending,
          departureCity: selectedPlace?.city,
          departureCountry: selectedPlace?.country,
          latitude: selectedPlace?.latitude,
          longitude: selectedPlace?.longitude,
          phone: lodgingChoice === "yes" ? phone : "",
          lodgingGuestNames: lodgingChoice === "yes" ? selectedGuestNames : [],
          lodgingNights: lodgingChoice === "yes" ? selectedNights : [],
          roommateWishes: lodgingChoice === "yes" ? roommateWishes : "",
          paymentMethod,
          songs: cleanSongs,
        }),
      });
      const data = (await response.json().catch(() => null)) as SubmitResult | null;
      if (!response.ok) throw new Error(data?.error ?? "Le serveur n’a pas pu enregistrer la réponse. Réessayez.");
      setResult(data);
      if (!manageToken) {
        window.localStorage.setItem("wedding-rsvp-completed", "true");
        window.dispatchEvent(new Event("wedding-rsvp-completed"));
      }
      setStatus(notAttending ? "declined" : "success");
    } catch (submitError) {
      setStatus("idle");
      setError(submitError instanceof TypeError
        ? "La connexion a été interrompue. Votre formulaire est conservé : cliquez à nouveau sur le bouton pour réessayer."
        : submitError instanceof Error ? submitError.message : "La réponse n’a pas pu être enregistrée. Réessayez.");
    }
  }

  const manageUrl = result?.manageUrl ?? (manageToken ? `/inscription/manage/${manageToken}` : "");

  return (
    <section className={`survey-experience${manageToken ? " survey-manage" : ""}`} id={manageToken ? undefined : "sondage"}>
      {!manageToken && (
        <div className="survey-intro">
          <p className="eyebrow">Votre réponse compte</p>
          <h2>Prêts à prendre la route avec nous ?</h2>
          <p>Une seule inscription suffit pour votre présence et, si vous le souhaitez, vos nuitées au domaine.</p>
        </div>
      )}

      <form className="wedding-form" onSubmit={submitResponse}>
        <div className="form-progress" aria-hidden="true"><span /></div>

        <fieldset>
          <legend><span>1</span> Nom et prénom</legend>
          <label className="sr-only" htmlFor="respondent-name">Nom et prénom</label>
          <input id="respondent-name" value={respondentName} onChange={(event) => setRespondentName(event.target.value)} placeholder="Votre nom et votre prénom" required />
        </fieldset>

        <fieldset>
          <legend><span>2</span> Votre adresse e-mail</legend>
          <label className="sr-only" htmlFor="respondent-email">Adresse e-mail</label>
          <input id="respondent-email" value={respondentEmail} onChange={(event) => setRespondentEmail(event.target.value)} placeholder="vous@exemple.com" type="email" required />
        </fieldset>

        <fieldset>
          <legend><span>3</span> J’embarque avec moi…</legend>
          <p className="field-help">Ajoutez une ligne pour chaque personne qui vous accompagne.</p>
          {companions.map((companion, index) => (
            <div className="repeatable-row" key={`companion-${index}`}>
              <input value={companion} onChange={(event) => setCompanions((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} placeholder={`Accompagnant ${index + 1}`} aria-label={`Nom de l’accompagnant ${index + 1}`} />
              <button type="button" className="remove-button" onClick={() => removeCompanion(index)} aria-label={`Retirer l’accompagnant ${index + 1}`}>×</button>
            </div>
          ))}
          <button type="button" className="add-line-button" onClick={() => setCompanions((current) => [...current, ""])}>+ Ajouter une personne</button>
        </fieldset>

        <fieldset>
          <legend><span>4</span> Je viendrai faire la fête avec vous…</legend>
          <div className="choice-grid">
            {attendanceOptions.map((option) => (
              <label className="choice-card" key={option.value}><input type="checkbox" checked={attendanceDays.includes(option.value)} onChange={() => toggleAttendance(option.value)} /><span>{option.label}</span></label>
            ))}
            <label className="choice-card choice-decline"><input type="checkbox" checked={notAttending} onChange={declineInvitation} /><span>Malheureusement, je ne pourrai pas être présent</span></label>
          </div>
        </fieldset>

        {!notAttending && attendanceDays.length > 0 && (
          <>
            <fieldset>
              <legend><span>5</span> Je partirai de…</legend>
              <p className="field-help">Indiquez une ville et un pays, puis sélectionnez le bon résultat. Exemples : Toulon, Charleroi, Faro, Cayenne ou Stavanger.</p>
              <div className="location-search">
                <input value={locationQuery} onChange={(event) => changeLocationQuery(event.target.value)} placeholder="Ville, pays" aria-label="Ville et pays de départ" />
                <button type="button" onClick={searchLocation} disabled={searching}>{searching ? "Recherche…" : "Rechercher"}</button>
              </div>
              {places.length > 0 && <div className="place-results">{places.map((place) => <button type="button" key={`${place.latitude}-${place.longitude}`} onClick={() => choosePlace(place)}><strong>{place.city}, {place.country}</strong><small>{place.label}</small></button>)}</div>}
              {selectedPlace && <p className="selected-place">✓ Départ sélectionné : {selectedPlace.city}, {selectedPlace.country}</p>}
            </fieldset>

            <fieldset>
              <legend><span>6</span> Pour en profiter au maximum, je souhaite dormir sur place</legend>
              <div className="lodging-note">Les chambres sont composées de lits simples entre 2 et 5 personnes. On vous connaît tous, on fera au mieux pour les répartitions. La participation est de <strong>35 € par personne et par nuit</strong>.</div>
              <div className="choice-grid lodging-answer">
                <label className="choice-card"><input type="radio" name="lodging-choice" checked={lodgingChoice === "yes"} onChange={() => setLodgingChoice("yes")} /><span>Oui, je souhaite dormir au domaine</span></label>
                <label className="choice-card"><input type="radio" name="lodging-choice" checked={lodgingChoice === "no"} onChange={() => { setLodgingChoice("no"); setSelectedNights([]); setLodgingGuestIndexes([]); }} /><span>Non merci</span></label>
              </div>

              {lodgingChoice === "yes" && (
                <div className="unified-lodging">
                  <div>
                    <h3>Qui dormira sur place ?</h3>
                    <div className="lodging-person-grid">
                      {participants.map((participant) => (
                        <label className={`choice-card${participant.name ? "" : " choice-disabled"}`} key={participant.index}>
                          <input type="checkbox" disabled={!participant.name} checked={lodgingGuestIndexes.includes(participant.index)} onChange={() => setLodgingGuestIndexes((current) => current.includes(participant.index) ? current.filter((item) => item !== participant.index) : [...current, participant.index])} />
                          <span>{participant.name || (participant.index === 0 ? "Renseignez votre nom" : `Accompagnant ${participant.index}`)}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h3>Pour quelles nuits ?</h3>
                    <div className="lodging-night-choices">
                      {lodgingNights.map((night) => <label key={night.value}><input type="checkbox" checked={selectedNights.includes(night.value)} onChange={() => toggleNight(night.value)} /><span>{night.label}</span></label>)}
                    </div>
                  </div>
                  <label>Numéro de téléphone pour la réservation<input value={phone} onChange={(event) => setPhone(event.target.value)} type="tel" autoComplete="tel" placeholder="06…" /></label>
                  <label className="roommate-field">Avec qui aimeriez-vous partager votre chambre ? <span>(facultatif)</span><textarea value={roommateWishes} onChange={(event) => setRoommateWishes(event.target.value)} placeholder="Votre souhait de chambre" /></label>
                  <fieldset className="lodging-payment-fieldset">
                    <legend>Votre règlement</legend>
                    <div className="lodging-payment-choices">
                      <label><input type="radio" name="payment" checked={paymentMethod === "wero"} onChange={() => setPaymentMethod("wero")} /><span>Wero</span></label>
                      <label><input type="radio" name="payment" checked={paymentMethod === "bank_transfer"} onChange={() => setPaymentMethod("bank_transfer")} /><span>Virement bancaire</span></label>
                      <label><input type="radio" name="payment" checked={paymentMethod === "later"} onChange={() => setPaymentMethod("later")} /><span>Je paierai plus tard</span></label>
                    </div>
                  </fieldset>
                  {lodgingTotal > 0 && <p className="lodging-total">{selectedGuestNames.length} personne{selectedGuestNames.length > 1 ? "s" : ""} × {selectedNights.length} nuit{selectedNights.length > 1 ? "s" : ""} × 35 €<br />Participation hébergement : <strong>{lodgingTotal} €</strong></p>}
                </div>
              )}
            </fieldset>

            <fieldset>
              <legend><span>7</span> Pour être certain de me déhancher sur le dancefloor, je souhaiterais écouter…</legend>
              <p className="field-help">Cette question est facultative.</p>
              {songs.map((song, index) => (
                <div className="repeatable-row" key={`song-${index}`}><input value={song} onChange={(event) => setSongs((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} placeholder="Titre – Artiste" aria-label={`Musique ${index + 1}`} />{songs.length > 1 && <button type="button" className="remove-button" onClick={() => setSongs((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Retirer la musique ${index + 1}`}>×</button>}</div>
              ))}
              <button type="button" className="add-line-button" onClick={() => setSongs((current) => [...current, ""])}>+ Ajouter un autre morceau</button>
            </fieldset>
          </>
        )}

        {error && <p className="form-error">{error}</p>}

        {status === "success" || status === "declined" ? (
          <div className={`form-success${status === "declined" ? " form-declined" : ""}`}>
            <span aria-hidden="true">{status === "declined" ? "💌" : "🚲"}</span>
            <h3>{manageToken ? "Ta modification est bien enregistrée" : status === "declined" ? "Merci de nous avoir répondu" : "Ton inscription est bien enregistrée"}</h3>
            {result?.pendingValidation ? (
              <p>La modification de l’hébergement doit maintenant être validée. Ancien montant : <strong>{money(result.previousAmountCents ?? 0)}</strong> · nouveau montant : <strong>{money(result.newAmountCents ?? 0)}</strong>.</p>
            ) : status === "declined" ? (
              <p>Vous allez nous manquer, mais votre réponse est bien enregistrée.</p>
            ) : (
              <p>Ton vélo est désormais visible sur la carte collective.</p>
            )}
            <p>{result?.emailSent ? "Nous venons de t’envoyer un e-mail récapitulatif. Garde-le précieusement : il contient ton lien personnel." : "Conserve ce lien personnel : il te permettra de consulter ou modifier ton inscription."}</p>
            {manageUrl && <a className="manage-registration-link" href={manageUrl}>Voir mon inscription</a>}
          </div>
        ) : (
          <button type="submit" className="submit-rsvp" disabled={status === "submitting"}>{status === "submitting" ? "Enregistrement…" : manageToken ? "Enregistrer mes modifications" : notAttending ? "Envoyer ma réponse" : "Envoyer mon vélo vers Massacan"}</button>
        )}
      </form>
    </section>
  );
}
