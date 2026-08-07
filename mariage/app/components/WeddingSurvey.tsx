"use client";

import { FormEvent, useMemo, useState } from "react";
type Place = {
  label: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
};
const attendanceOptions = [
  { value: "2027-05-28", label: "Vendredi 28 mai 2027" },
  { value: "2027-05-29", label: "Samedi 29 mai 2027" },
  { value: "2027-05-30", label: "Dimanche 30 mai 2027" },
];
export default function WeddingSurvey() {
  const [respondentName, setRespondentName] = useState("");
  const [respondentEmail, setRespondentEmail] = useState("");
  const [companions, setCompanions] = useState<string[]>([]);
  const [attendanceDays, setAttendanceDays] = useState<string[]>([]);
  const [notAttending, setNotAttending] = useState(false);
  const [locationQuery, setLocationQuery] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [searching, setSearching] = useState(false);
  const [fridayLodging, setFridayLodging] = useState(false);
  const [saturdayLodging, setSaturdayLodging] = useState(false);
  const [noLodging, setNoLodging] = useState(false);
  const [fridaySleepers, setFridaySleepers] = useState(1);
  const [saturdaySleepers, setSaturdaySleepers] = useState(1);
  const [roommateWishes, setRoommateWishes] = useState("");
  const [songs, setSongs] = useState<string[]>([""]);
  const [status, setStatus] = useState<
    "idle" | "submitting" | "success" | "declined"
  >("idle");
  const [error, setError] = useState("");

  const groupSize = 1 + companions.filter((name) => name.trim()).length;
  const lodgingTotal =
    ((fridayLodging ? fridaySleepers : 0) +
      (saturdayLodging ? saturdaySleepers : 0)) *
    35;
  const wantsRoommateChoice =
    (fridayLodging && fridaySleepers <= 2) ||
    (saturdayLodging && saturdaySleepers <= 2);

  const cleanSongs = useMemo(
    () => songs.map((song) => song.trim()).filter(Boolean),
    [songs],
  );

  function toggleAttendance(day: string) {
    setNotAttending(false);
    setAttendanceDays((current) =>
      current.includes(day)
        ? current.filter((item) => item !== day)
        : [...current, day],
    );
  }

  function declineInvitation() {
    setNotAttending(true);
    setAttendanceDays([]);
  }

  function updateCompanion(index: number, value: string) {
    setCompanions((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? value : item)),
    );
  }

  function updateSong(index: number, value: string) {
    setSongs((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? value : item)),
    );
  }

  async function searchLocation() {
    setError("");
    setSelectedPlace(null);
    setPlaces([]);

    if (locationQuery.trim().length < 3) {
      setError("Indique une ville et un pays.");
      return;
    }

    setSearching(true);
    try {
      const response = await fetch(
        `/api/geocode?q=${encodeURIComponent(locationQuery.trim())}`,
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setPlaces(data.places ?? []);
      if (!data.places?.length) {
        setError("Aucun lieu trouvé. Ajoute le pays à ta recherche.");
      }
    } catch (searchError) {
      setError(
        searchError instanceof Error
          ? searchError.message
          : "La recherche n’a pas fonctionné.",
      );
    } finally {
      setSearching(false);
    }
  }

  function choosePlace(place: Place) {
    setSelectedPlace(place);
    setLocationQuery(`${place.city}, ${place.country}`);
    setPlaces([]);
    setError("");
  }

  async function submitResponse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!respondentName.trim()) {
      setError("Indique ton nom et ton prénom.");
      return;
    }

    if (!notAttending && attendanceDays.length === 0) {
      setError("Sélectionne au moins une journée.");
      return;
    }

    if (!notAttending && !selectedPlace) {
      setError("Recherche puis sélectionne ta ville de départ.");
      return;
    }

    if (!notAttending && !fridayLodging && !saturdayLodging && !noLodging) {
      setError("Indique si tu souhaites dormir sur place.");
      return;
    }

    setStatus("submitting");
    try {
      const response = await fetch("/api/rsvp", {
        method: "POST",
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
          fridaySleepers: fridayLodging ? fridaySleepers : 0,
          saturdaySleepers: saturdayLodging ? saturdaySleepers : 0,
          roommateWishes: wantsRoommateChoice ? roommateWishes : "",
          songs: cleanSongs,
        }),
      });
      const data = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) {
        throw new Error(
          data?.error ??
            "Le serveur n’a pas pu enregistrer la réponse. Réessayez.",
        );
      }

      window.localStorage.setItem("wedding-rsvp-completed", "true");
      window.dispatchEvent(new Event("wedding-rsvp-completed"));

      if (notAttending) {
        setStatus("declined");
        return;
      }

      setStatus("success");
    } catch (submitError) {
      setStatus("idle");
      setError(
        submitError instanceof TypeError
          ? "La connexion a été interrompue. Votre formulaire est conservé : cliquez à nouveau sur le bouton pour réessayer."
          : submitError instanceof Error
            ? submitError.message
            : "La réponse n’a pas pu être enregistrée. Réessayez.",
      );
    }
  }

  return (
    <section className="survey-experience" id="sondage">
      <div className="survey-intro">
        <p className="eyebrow">Votre réponse compte</p>
        <h2>Prêts à prendre la route avec nous ?</h2>
        <p>
          Répondez à quelques questions pour nous aider à préparer le week-end.
          Si vous nous rejoignez, votre vélo prendra ensuite la route jusqu’au
          Domaine de Massacan.
        </p>
      </div>


      <form className="wedding-form" onSubmit={submitResponse}>
        <div className="form-progress" aria-hidden="true">
          <span />
        </div>

        <fieldset>
          <legend>
            <span>1</span> Nom et prénom
          </legend>
          <label className="sr-only" htmlFor="respondent-name">
            Nom et prénom
          </label>
          <input
            id="respondent-name"
            value={respondentName}
            onChange={(event) => setRespondentName(event.target.value)}
            placeholder="Votre nom et votre prénom"
            required
          />
        </fieldset>

        <fieldset>
          <legend>
            <span>2</span> Votre adresse e-mail
          </legend>
          <label className="sr-only" htmlFor="respondent-email">
            Adresse e-mail
          </label>
          <input
            id="respondent-email"
            value={respondentEmail}
            onChange={(event) => setRespondentEmail(event.target.value)}
            placeholder="vous@exemple.com"
            type="email"
            required
          />
        </fieldset>

        <fieldset>
          <legend>
            <span>3</span> J’embarque avec moi…
          </legend>
          <p className="field-help">
            Ajoutez une ligne pour chaque personne qui vous accompagne.
          </p>
          {companions.map((companion, index) => (
            <div className="repeatable-row" key={`companion-${index}`}>
              <input
                value={companion}
                onChange={(event) => updateCompanion(index, event.target.value)}
                placeholder={`Accompagnant ${index + 1}`}
                aria-label={`Nom de l’accompagnant ${index + 1}`}
              />
              <button
                type="button"
                className="remove-button"
                onClick={() =>
                  setCompanions((current) =>
                    current.filter((_, itemIndex) => itemIndex !== index),
                  )
                }
                aria-label={`Retirer l’accompagnant ${index + 1}`}
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            className="add-line-button"
            onClick={() => setCompanions((current) => [...current, ""])}
          >
            + Ajouter une personne
          </button>
        </fieldset>

        <fieldset>
          <legend>
            <span>4</span> Je viendrai faire la fête avec vous…
          </legend>
          <div className="choice-grid">
            {attendanceOptions.map((option) => (
              <label className="choice-card" key={option.value}>
                <input
                  type="checkbox"
                  checked={attendanceDays.includes(option.value)}
                  onChange={() => toggleAttendance(option.value)}
                />
                <span>{option.label}</span>
              </label>
            ))}
            <label className="choice-card choice-decline">
              <input
                type="checkbox"
                checked={notAttending}
                onChange={declineInvitation}
              />
              <span>Malheureusement, je ne pourrai pas être présent</span>
            </label>
          </div>
        </fieldset>

        {!notAttending && attendanceDays.length > 0 && (
          <>
            <fieldset>
              <legend>
                <span>5</span> Je partirai de…
              </legend>
              <p className="field-help">
                Indiquez une ville et un pays, puis sélectionnez le bon résultat.
                Exemples : Toulon, Charleroi, Faro, Cayenne ou Stavanger.
              </p>
              <div className="location-search">
                <input
                  value={locationQuery}
                  onChange={(event) => {
                    setLocationQuery(event.target.value);
                    setSelectedPlace(null);
                  }}
                  placeholder="Ville, pays"
                  aria-label="Ville et pays de départ"
                />
                <button
                  type="button"
                  onClick={searchLocation}
                  disabled={searching}
                >
                  {searching ? "Recherche…" : "Rechercher"}
                </button>
              </div>
              {places.length > 0 && (
                <div className="place-results">
                  {places.map((place) => (
                    <button
                      type="button"
                      key={`${place.latitude}-${place.longitude}`}
                      onClick={() => choosePlace(place)}
                    >
                      <strong>
                        {place.city}, {place.country}
                      </strong>
                      <small>{place.label}</small>
                    </button>
                  ))}
                </div>
              )}
              {selectedPlace && (
                <p className="selected-place">
                  ✓ Départ sélectionné : {selectedPlace.city},{" "}
                  {selectedPlace.country}
                </p>
              )}
            </fieldset>

            <fieldset>
              <legend>
                <span>6</span> Pour en profiter au maximum, je souhaite dormir
                sur place
              </legend>
              <div className="lodging-note">
                Les chambres sont composées de lits simples entre 2 et 5 personnes. On vous connaît tous, on fera au mieux pour les répartitions.
                La participation est de <strong>35 € par personne et par nuit</strong>.
              </div>
              <div className="choice-grid lodging-choices">
                <label className="choice-card">
                  <input
                    type="checkbox"
                    checked={fridayLodging}
                    onChange={() => {
                      setFridayLodging((current) => !current);
                      setNoLodging(false);
                    }}
                  />
                  <span>Oui, le vendredi soir</span>
                </label>
                <label className="choice-card">
                  <input
                    type="checkbox"
                    checked={saturdayLodging}
                    onChange={() => {
                      setSaturdayLodging((current) => !current);
                      setNoLodging(false);
                    }}
                  />
                  <span>Oui, le samedi soir</span>
                </label>
                <label className="choice-card">
                  <input
                    type="checkbox"
                    checked={noLodging}
                    onChange={() => {
                      setNoLodging(true);
                      setFridayLodging(false);
                      setSaturdayLodging(false);
                    }}
                  />
                  <span>Non merci</span>
                </label>
              </div>

              {(fridayLodging || saturdayLodging) && (
                <div className="sleepers-grid">
                  {fridayLodging && (
                    <label>
                      Nombre de personnes le vendredi
                      <input
                        type="number"
                        min="1"
                        max={Math.max(groupSize, 1)}
                        value={fridaySleepers}
                        onChange={(event) =>
                          setFridaySleepers(Number(event.target.value))
                        }
                      />
                    </label>
                  )}
                  {saturdayLodging && (
                    <label>
                      Nombre de personnes le samedi
                      <input
                        type="number"
                        min="1"
                        max={Math.max(groupSize, 1)}
                        value={saturdaySleepers}
                        onChange={(event) =>
                          setSaturdaySleepers(Number(event.target.value))
                        }
                      />
                    </label>
                  )}
                </div>
              )}

              {wantsRoommateChoice && (
                <label className="roommate-field">
                  Avec qui aimeriez-vous partager votre chambre ?
                  <textarea
                    value={roommateWishes}
                    onChange={(event) => setRoommateWishes(event.target.value)}
                    placeholder="Noms des personnes avec lesquelles vous aimeriez être regroupé"
                  />
                  <small>
                    Nous ferons notre maximum pour respecter votre souhait,
                    selon la répartition des chambres.
                  </small>
                </label>
              )}

              {lodgingTotal > 0 && (
                <p className="lodging-total">
                  Participation prévisionnelle : <strong>{lodgingTotal} €</strong>
                </p>
              )}
            </fieldset>

            <fieldset>
              <legend>
                <span>7</span> Pour être certain de me déhancher sur le
                dancefloor, je souhaiterais écouter…
              </legend>
              <p className="field-help">Cette question est facultative.</p>
              {songs.map((song, index) => (
                <div className="repeatable-row" key={`song-${index}`}>
                  <input
                    value={song}
                    onChange={(event) => updateSong(index, event.target.value)}
                    placeholder="Titre – Artiste"
                    aria-label={`Musique ${index + 1}`}
                  />
                  {songs.length > 1 && (
                    <button
                      type="button"
                      className="remove-button"
                      onClick={() =>
                        setSongs((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                      aria-label={`Retirer la musique ${index + 1}`}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                className="add-line-button"
                onClick={() => setSongs((current) => [...current, ""])}
              >
                + Ajouter un autre morceau
              </button>
            </fieldset>
          </>
        )}

        {error && <p className="form-error">{error}</p>}

        {status === "success" ? (
          <div className="form-success">
            <span>🚲</span>
            <h3>Votre vélo est arrivé à Massacan !</h3>
            <p>
              Merci pour votre réponse. Votre trajet reste maintenant visible
              sur notre carte collective.
            </p>
          </div>
        ) : status === "declined" ? (
          <div className="form-success form-declined">
            <span>💌</span>
            <h3>Merci de nous avoir répondu</h3>
            <p>Vous allez nous manquer, mais votre réponse est bien enregistrée.</p>
          </div>
        ) : (
          <button
            type="submit"
            className="submit-rsvp"
            disabled={status === "submitting"}
          >
            {status === "submitting"
              ? "Enregistrement…"
              : notAttending
                ? "Envoyer ma réponse"
                : "Envoyer mon vélo vers Massacan"}
          </button>
        )}
      </form>
    </section>
  );
}

