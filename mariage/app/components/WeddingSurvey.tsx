"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { mapGeometry } from "./mapGeometry";

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

type GuestRouteGroup = GuestRoute & {
  members: GuestRoute[];
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

const MAP_BOUNDS = {
  minLatitude: 40,
  maxLatitude: 53,
  minLongitude: -6,
  maxLongitude: 12,
};

const MAIN_MAP_ZOOM = {
  factor: 1.38,
  centerX: 250,
  centerY: 245,
};

function project(latitude: number, longitude: number) {
  const longitudeRadians = (longitude * Math.PI) / 180;
  const latitudeRadians = (latitude * Math.PI) / 180;
  const baseX =
    mapGeometry.mainTranslate[0] +
    mapGeometry.mainScale * longitudeRadians;
  const baseY =
    mapGeometry.mainTranslate[1] -
    mapGeometry.mainScale *
      Math.log(Math.tan((Math.PI / 2 + latitudeRadians) / 2));

  return {
    x:
      MAIN_MAP_ZOOM.centerX +
      (baseX - MAIN_MAP_ZOOM.centerX) * MAIN_MAP_ZOOM.factor,
    y:
      MAIN_MAP_ZOOM.centerY +
      (baseY - MAIN_MAP_ZOOM.centerY) * MAIN_MAP_ZOOM.factor,
  };
}

function projectWorld(latitude: number, longitude: number) {
  return {
    x:
      mapGeometry.worldTranslate[0] +
      mapGeometry.worldScale * ((longitude * Math.PI) / 180),
    y:
      mapGeometry.worldTranslate[1] -
      mapGeometry.worldScale * ((latitude * Math.PI) / 180),
  };
}

function isRegionalRoute(route: GuestRoute) {
  return (
    route.latitude >= MAP_BOUNDS.minLatitude &&
    route.latitude <= MAP_BOUNDS.maxLatitude &&
    route.longitude >= MAP_BOUNDS.minLongitude &&
    route.longitude <= MAP_BOUNDS.maxLongitude
  );
}

function groupRoutesByCity(routes: GuestRoute[]) {
  const groups = new Map<string, GuestRouteGroup>();

  for (const route of routes) {
    const key = `${route.city.trim().toLocaleLowerCase("fr")}|${route.country
      .trim()
      .toLocaleLowerCase("fr")}`;
    const existing = groups.get(key);

    if (existing) {
      existing.members.push(route);
      existing.animate = existing.animate || route.animate;
    } else {
      groups.set(key, { ...route, members: [route] });
    }
  }

  return [...groups.values()];
}

function routeTooltip(route: GuestRouteGroup) {
  const names = [...new Set(route.members.map((member) => member.display_name))];
  return `${route.city}, ${route.country} · ${route.members.length} réponse${
    route.members.length > 1 ? "s" : ""
  } · ${names.join(", ")}`;
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
  const routeGroups = groupRoutesByCity(routes);
  const regionalRoutes = routeGroups.filter(isRegionalRoute);
  const distantRoutes = routeGroups.filter((route) => !isRegionalRoute(route));
  const visibleDistantRoutes = distantRoutes.slice(0, 12);
  const mapWidth = distantRoutes.length ? 720 : 550;

  return (
    <div className="journey-map">
      <div className="map-heading">
        <div>
          <p className="eyebrow">La carte collective</p>
          <h3>Tous les chemins mènent à Massacan</h3>
        </div>
        <span className="bike-counter">
          {routeGroups.length} ville{routeGroups.length > 1 ? "s" : ""} ·{" "}
          {routes.length} réponse{routes.length > 1 ? "s" : ""}
        </span>
      </div>

      <svg
        className="world-map"
        viewBox={`0 0 ${mapWidth} 420`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Carte centrée sur la France et la Belgique montrant les trajets vers le Domaine de Massacan"
      >
        <defs>
          <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#eee5d3" />
            <stop offset="1" stopColor="#dcd3bf" />
          </linearGradient>
          <filter id="map-shadow">
            <feDropShadow dx="0" dy="3" stdDeviation="4" floodOpacity=".16" />
          </filter>
          <clipPath id="main-map-clip">
            <rect x="0" y="0" width="520" height="420" rx="22" />
          </clipPath>
        </defs>

        <rect width={mapWidth} height="420" rx="22" fill="url(#paper)" />
        <g className="map-grid">
          <path d="M25 115H520M25 210H520M25 305H520" />
          <path d="M149 20V400M273 20V400M396 20V400" />
        </g>

        <g
          className="countries"
          filter="url(#map-shadow)"
          clipPath="url(#main-map-clip)"
          transform={`translate(${MAIN_MAP_ZOOM.centerX} ${MAIN_MAP_ZOOM.centerY}) scale(${MAIN_MAP_ZOOM.factor}) translate(${-MAIN_MAP_ZOOM.centerX} ${-MAIN_MAP_ZOOM.centerY})`}
        >
          {mapGeometry.regionPaths.map((country) => (
            <path
              className={
                country.name === "France" || country.name === "Belgium"
                  ? "country-focus"
                  : undefined
              }
              d={country.path}
              key={country.name}
            />
          ))}
        </g>

        <g className="country-labels" aria-hidden="true">
          <text x={project(46.4, 2.1).x} y={project(46.4, 2.1).y}>
            FRANCE
          </text>
          <text x={project(50.7, 4.5).x} y={project(50.7, 4.5).y}>
            BELGIQUE
          </text>
        </g>

        {regionalRoutes.map((route, index) => {
          const curve = curveFor(route, index);
          const clusterAngle = index * 2.35;
          const clusterRadius = 12 + Math.min(32, index * 2.5);
          const parkedX =
            destination.x + Math.cos(clusterAngle) * clusterRadius;
          const parkedY =
            destination.y + Math.sin(clusterAngle) * clusterRadius;

          return (
            <g
              className="bike-marker"
              key={`${route.city}-${route.country}`}
              role="img"
              aria-label={routeTooltip(route)}
            >
              <title>{routeTooltip(route)}</title>
              <path className="guest-route" d={curve.path} />

              {route.animate ? (
                <text className="moving-bike">
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
                >
                  🚲
                </text>
              )}
            </g>
          );
        })}

        <g
          className="destination-pin"
          role="img"
          aria-label="Domaine de Massacan, destination du mariage"
        >
          <title>Domaine de Massacan · Destination du mariage</title>
          <circle
            className="destination-hit"
            cx={destination.x}
            cy={destination.y}
            r="11"
          />
          <circle
            className="destination-dot"
            cx={destination.x}
            cy={destination.y}
            r="3"
          />
        </g>

        {distantRoutes.length > 0 && (
          <g className="world-inset">
            <rect x="535" y="35" width="170" height="350" rx="16" />
            <text className="distant-title" x="550" y="60">
              DÉPARTS LOINTAINS
            </text>
            <path className="mini-world-land" d={mapGeometry.worldPath} />
            {visibleDistantRoutes.map((route) => {
              const point = projectWorld(route.latitude, route.longitude);
              return (
                <g
                  className="distant-origin"
                  key={`${route.city}-${route.country}`}
                  role="img"
                  aria-label={routeTooltip(route)}
                >
                  <title>{routeTooltip(route)}</title>
                  <circle cx={point.x} cy={point.y} r="4.5" />
                </g>
              );
            })}
            {distantRoutes.length > visibleDistantRoutes.length && (
              <text className="distant-more" x="550" y="388">
                + {distantRoutes.length - visibleDistantRoutes.length} autre
                {distantRoutes.length - visibleDistantRoutes.length > 1
                  ? "s"
                  : ""}
              </text>
            )}
          </g>
        )}
      </svg>

      {routes.length === 0 && (
        <p className="map-empty">
          Le premier vélo apparaîtra ici dès qu’une réponse sera envoyée.
        </p>
      )}
      {distantRoutes.length > 0 && (
        <p className="distant-note">
          Survolez un vélo ou un point pour afficher les informations. Le
          mini-planisphère apparaît uniquement pour les départs éloignés.
        </p>
      )}
      <p className="map-attribution">
        Géographie : Natural Earth · Recherche : © OpenStreetMap contributors
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
