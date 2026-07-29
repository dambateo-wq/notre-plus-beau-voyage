"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Place = {
  label: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
};

type GuestRoute = {
  id: string;
  display_name: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  created_at: string;
  animate?: boolean;
};

const MASSACAN = {
  city: "Domaine de Massacan",
  latitude: 43.108305,
  longitude: 5.9821616,
};

const attendanceOptions = [
  { value: "2027-05-28", label: "Vendredi 28 mai 2027" },
  { value: "2027-05-29", label: "Samedi 29 mai 2027" },
  { value: "2027-05-30", label: "Dimanche 30 mai 2027" },
];

function project(latitude: number, longitude: number) {
  return {
    x: ((longitude + 180) / 360) * 1000,
    y: ((90 - latitude) / 180) * 500,
  };
}

function curveFor(route: GuestRoute, index: number) {
  const start = project(route.latitude, route.longitude);
  const end = project(MASSACAN.latitude, MASSACAN.longitude);
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  const direction = index % 2 === 0 ? -1 : 1;
  const lift = Math.min(130, 35 + distance * 0.22) * direction;
  const middleX = (start.x + end.x) / 2;
  const middleY = (start.y + end.y) / 2 + lift;

  return {
    start,
    end,
    path: `M ${start.x} ${start.y} Q ${middleX} ${middleY} ${end.x} ${end.y}`,
  };
}

function JourneyMap({ routes }: { routes: GuestRoute[] }) {
  const destination = project(MASSACAN.latitude, MASSACAN.longitude);

  return (
    <div className="journey-map">
      <div className="map-heading">
        <div>
          <p className="eyebrow">La carte collective</p>
          <h3>Tous les chemins mènent à Massacan</h3>
        </div>
        <span className="bike-counter">
          {routes.length} vélo{routes.length > 1 ? "s" : ""} en route
        </span>
      </div>

      <svg
        className="world-map"
        viewBox="0 0 1000 500"
        role="img"
        aria-label="Carte des trajets des invités vers le Domaine de Massacan"
      >
        <defs>
          <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#eee5d3" />
            <stop offset="1" stopColor="#dcd3bf" />
          </linearGradient>
          <filter id="map-shadow">
            <feDropShadow dx="0" dy="3" stdDeviation="4" floodOpacity=".16" />
          </filter>
        </defs>

        <rect width="1000" height="500" rx="28" fill="url(#paper)" />
        <g className="continents" filter="url(#map-shadow)">
          <path d="M72 105 128 67 210 56 270 85 282 128 245 154 224 205 180 220 158 182 112 175 82 142Z" />
          <path d="M232 236 285 248 323 298 310 365 279 433 249 397 240 330 211 278Z" />
          <path d="M425 94 476 62 538 72 568 103 542 133 495 135 462 119Z" />
          <path d="M462 145 523 142 562 187 551 256 518 334 479 310 459 239 429 188Z" />
          <path d="M545 99 627 66 741 70 850 112 895 158 849 195 775 189 719 221 663 194 613 151Z" />
          <path d="M787 296 842 276 891 300 910 350 867 379 813 363 779 330Z" />
          <path d="M925 397 941 390 949 407 936 419Z" />
        </g>

        <g className="map-grid">
          <path d="M0 125H1000M0 250H1000M0 375H1000" />
          <path d="M250 0V500M500 0V500M750 0V500" />
        </g>

        {routes.map((route, index) => {
          const curve = curveFor(route, index);
          const clusterAngle = index * 2.35;
          const clusterRadius = 12 + Math.min(32, index * 2.5);
          const parkedX =
            destination.x + Math.cos(clusterAngle) * clusterRadius;
          const parkedY =
            destination.y + Math.sin(clusterAngle) * clusterRadius;

          return (
            <g key={route.id}>
              <path className="guest-route" d={curve.path} />
              <circle
                className="departure-dot"
                cx={curve.start.x}
                cy={curve.start.y}
                r="5"
              />
              <text
                className="departure-label"
                x={curve.start.x + 9}
                y={curve.start.y - 9}
              >
                {route.display_name} · {route.city}
              </text>

              {route.animate ? (
                <text className="moving-bike" aria-hidden="true">
                  🚲
                  <animateMotion
                    dur="4.8s"
                    path={curve.path}
                    fill="freeze"
                    keyPoints="0;1"
                    keyTimes="0;1"
                    calcMode="spline"
                    keySplines=".42 0 .2 1"
                  />
                </text>
              ) : (
                <text
                  className="parked-bike"
                  x={parkedX}
                  y={parkedY}
                  aria-hidden="true"
                >
                  🚲
                </text>
              )}
            </g>
          );
        })}

        <g className="destination-pin">
          <circle cx={destination.x} cy={destination.y} r="11" />
          <circle cx={destination.x} cy={destination.y} r="4" />
          <text x={destination.x + 16} y={destination.y + 5}>
            Domaine de Massacan
          </text>
        </g>
      </svg>

      {routes.length === 0 && (
        <p className="map-empty">
          Le premier vélo apparaîtra ici dès qu’une réponse sera envoyée.
        </p>
      )}
      <p className="map-attribution">
        Recherche géographique : © OpenStreetMap contributors
      </p>
    </div>
  );
}

export default function WeddingSurvey() {
  const [respondentName, setRespondentName] = useState("");
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
  const [routes, setRoutes] = useState<GuestRoute[]>([]);
  const [status, setStatus] = useState<
    "idle" | "submitting" | "success" | "declined"
  >("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/routes")
      .then((response) => response.json())
      .then((data: GuestRoute[]) => setRoutes(Array.isArray(data) ? data : []))
      .catch(() => setRoutes([]));
  }, []);

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

      if (notAttending) {
        setStatus("declined");
        return;
      }

      if (selectedPlace) {
        setRoutes((current) => [
          ...current,
          {
            id: `new-${Date.now()}`,
            display_name: respondentName.trim(),
            city: selectedPlace.city,
            country: selectedPlace.country,
            latitude: selectedPlace.latitude,
            longitude: selectedPlace.longitude,
            created_at: new Date().toISOString(),
            animate: true,
          },
        ]);
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

      <JourneyMap routes={routes} />

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
            <span>2</span> J’embarque avec moi…
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
            <span>3</span> Je viendrai faire la fête avec vous…
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
                <span>4</span> Je partirai de…
              </legend>
              <p className="field-help">
                Indiquez une ville et un pays, puis sélectionnez le bon résultat.
                Exemples : Toulon, Charleroi, Faro ou Cayenne.
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
                <span>5</span> Pour en profiter au maximum, je souhaite dormir
                sur place
              </legend>
              <div className="lodging-note">
                La majorité des chambres sont composées de quatre lits simples.
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
                <span>6</span> Pour être certain de me déhancher sur le
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
