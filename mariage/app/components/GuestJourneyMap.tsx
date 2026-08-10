"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./GuestJourneyMap.module.css";

type GuestRoute = {
  id: string;
  display_name: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  created_at: string;
};

type CityGroup = GuestRoute & {
  members: GuestRoute[];
};

type Leaflet = typeof import("leaflet");
type LeafletMap = import("leaflet").Map;
type LeafletMarker = import("leaflet").Marker;

const MASSACAN = {
  latitude: 43.108305,
  longitude: 5.9821616,
};

const MAIN_BOUNDS: [[number, number], [number, number]] = [
  [35.4, -10.8],
  [52.8, 14.5],
];

const OSM_TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

const BIKE_SVG = `
  <svg viewBox="0 0 30 20" aria-hidden="true" focusable="false">
    <g fill="none" stroke="#95684f" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="6" cy="14" r="4.25"/><circle cx="24" cy="14" r="4.25"/>
      <path d="M6 14l5-8h5l-4 8h12l-6-8M10 6H7.8M16 6l2-2.2h3"/>
    </g>
  </svg>`;

const DESTINATION_SVG = `
  <svg viewBox="0 0 28 34" aria-hidden="true" focusable="false">
    <path d="M14 1.5c-6.1 0-11 4.9-11 11 0 8.2 11 19.5 11 19.5s11-11.3 11-19.5c0-6.1-4.9-11-11-11Z" fill="#4f6048" stroke="#f5efdf" stroke-width="2"/>
    <circle cx="14" cy="12.5" r="4" fill="#c2a46c"/>
  </svg>`;

function groupRoutesByCity(routes: GuestRoute[]) {
  const groups = new Map<string, CityGroup>();

  for (const route of routes) {
    if (
      !route.city ||
      !route.country ||
      !Number.isFinite(route.latitude) ||
      !Number.isFinite(route.longitude)
    ) {
      continue;
    }

    const key = `${route.city.trim().toLocaleLowerCase("fr")}|${route.country
      .trim()
      .toLocaleLowerCase("fr")}`;
    const existing = groups.get(key);

    if (existing) {
      existing.members.push(route);
    } else {
      groups.set(key, { ...route, members: [route] });
    }
  }

  return [...groups.values()];
}

function isInMainRegion(route: CityGroup) {
  return (
    route.latitude >= 35 &&
    route.latitude <= 55.5 &&
    route.longitude >= -12.5 &&
    route.longitude <= 18
  );
}

function curvedRoute(
  start: [number, number],
  end: [number, number],
  index: number,
  distant = false,
) {
  const [startLat, startLng] = start;
  const [endLat, endLng] = end;
  const deltaLat = endLat - startLat;
  const deltaLng = endLng - startLng;
  const distance = Math.max(Math.hypot(deltaLat, deltaLng), 0.001);
  const direction = index % 2 === 0 ? 1 : -1;
  const bend = Math.min(distance * 0.1, distant ? 7 : 2.15) * direction;
  const controlLat = (startLat + endLat) / 2 - (deltaLng / distance) * bend;
  const controlLng = (startLng + endLng) / 2 + (deltaLat / distance) * bend;

  return Array.from({ length: 33 }, (_, step) => {
    const t = step / 32;
    const inverse = 1 - t;
    return [
      inverse * inverse * startLat +
        2 * inverse * t * controlLat +
        t * t * endLat,
      inverse * inverse * startLng +
        2 * inverse * t * controlLng +
        t * t * endLng,
    ] as [number, number];
  });
}

function popupContent(group: CityGroup) {
  const card = document.createElement("div");
  card.className = styles.popupCard;

  const city = document.createElement("strong");
  city.textContent = group.city;
  card.append(city);

  const country = document.createElement("span");
  country.textContent = group.country;
  card.append(country);

  const count = document.createElement("b");
  count.textContent = `${group.members.length} voyageur${
    group.members.length > 1 ? "s" : ""
  }`;
  card.append(count);

  const names = [...new Set(group.members.map((member) => member.display_name))]
    .filter(Boolean)
    .slice(0, 5);
  if (names.length) {
    const people = document.createElement("small");
    people.textContent = names.join(" · ");
    card.append(people);
  }

  return card;
}

function bindCityPopup(marker: LeafletMarker, group: CityGroup) {
  marker.bindPopup(popupContent(group), {
    className: styles.popup,
    closeButton: false,
    maxWidth: 260,
    offset: [0, -8],
  });
  marker.on("mouseover", () => marker.openPopup());
  marker.on("mouseout", () => marker.closePopup());
}

function addTiles(L: Leaflet, map: LeafletMap) {
  L.tileLayer(OSM_TILES, {
    attribution: OSM_ATTRIBUTION,
    maxZoom: 19,
    noWrap: true,
  }).addTo(map);
}

function addDestination(
  L: Leaflet,
  map: LeafletMap,
  withLabel: boolean,
) {
  const icon = L.divIcon({
    html: DESTINATION_SVG,
    className: styles.destinationIcon,
    iconAnchor: [14, 31],
    iconSize: [28, 34],
  });
  const marker = L.marker([MASSACAN.latitude, MASSACAN.longitude], {
    alt: "Domaine du Massacan, destination du mariage",
    icon,
    keyboard: true,
    title: "Domaine du Massacan",
    zIndexOffset: 1000,
  }).addTo(map);

  if (withLabel) {
    marker.bindTooltip("Domaine du Massacan", {
      className: styles.destinationLabel,
      direction: "top",
      offset: [0, -28],
      permanent: true,
    });
  }
}

function addCityLayers(
  L: Leaflet,
  map: LeafletMap,
  groups: CityGroup[],
  timers: ReturnType<typeof setTimeout>[],
  reducedMotion: boolean,
  distant = false,
) {
  const destination: [number, number] = [
    MASSACAN.latitude,
    MASSACAN.longitude,
  ];
  const originStep = reducedMotion ? 0 : 105;
  const routeStart = reducedMotion ? 0 : groups.length * originStep + 280;
  const bikeStart = reducedMotion ? 0 : routeStart + 560;

  const schedule = (callback: () => void, delay: number) => {
    if (reducedMotion || delay === 0) {
      callback();
      return;
    }
    timers.push(setTimeout(callback, delay));
  };

  groups.forEach((group, index) => {
    const origin: [number, number] = [group.latitude, group.longitude];

    schedule(() => {
      L.circleMarker(origin, {
        className: styles.originDot,
        color: "#f8f2e6",
        fillColor: "#a8795d",
        fillOpacity: 1,
        opacity: 1,
        radius: distant ? 3.2 : 3.6,
        weight: 1.5,
      }).addTo(map);
    }, index * originStep);

    schedule(() => {
      L.polyline(curvedRoute(origin, destination, index, distant), {
        className: styles.routeLine,
        color: "#9c795f",
        dashArray: "3 9",
        interactive: false,
        lineCap: "round",
        opacity: distant ? 0.3 : 0.34,
        smoothFactor: 1.25,
        weight: distant ? 1 : 1.25,
      }).addTo(map);
    }, routeStart + index * 90);

    schedule(() => {
      const icon = L.divIcon({
        html: `<span class="${styles.bikeGlyph}" aria-hidden="true">${BIKE_SVG}</span>`,
        className: styles.bikeIcon,
        iconAnchor: [15, 10],
        iconSize: [30, 20],
        popupAnchor: [0, -10],
      });
      const marker = L.marker(origin, {
        alt: `Départ de ${group.city}, ${group.country}`,
        icon,
        keyboard: true,
        riseOnHover: true,
        title: `${group.city}, ${group.country}`,
      }).addTo(map);
      bindCityPopup(marker, group);
    }, bikeStart + index * 105);
  });
}

export default function GuestJourneyMap() {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const insetElementRef = useRef<HTMLDivElement>(null);
  const [routes, setRoutes] = useState<GuestRoute[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadRoutes() {
      try {
        const response = await fetch("/api/routes", { cache: "no-store" });
        if (!response.ok) throw new Error("routes unavailable");
        const data = (await response.json()) as GuestRoute[];
        if (!active) return;
        setRoutes(Array.isArray(data) ? data : []);
        setLoadError(false);
      } catch {
        if (!active) return;
        setRoutes([]);
        setLoadError(true);
      }
    }

    void loadRoutes();
    const refresh = () => void loadRoutes();
    window.addEventListener("wedding-rsvp-completed", refresh);
    return () => {
      active = false;
      window.removeEventListener("wedding-rsvp-completed", refresh);
    };
  }, []);

  const groups = useMemo(() => groupRoutesByCity(routes ?? []), [routes]);
  const distantGroups = useMemo(
    () => groups.filter((route) => !isInMainRegion(route)),
    [groups],
  );

  useEffect(() => {
    if (routes === null || !mapElementRef.current) return;

    let disposed = false;
    let map: LeafletMap | undefined;
    let insetMap: LeafletMap | undefined;
    const timers: ReturnType<typeof setTimeout>[] = [];

    async function initialiseMaps() {
      const L = await import("leaflet");
      if (disposed || !mapElementRef.current) return;
      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;

      map = L.map(mapElementRef.current, {
        attributionControl: true,
        scrollWheelZoom: false,
        zoomControl: false,
        zoomSnap: 0.25,
      });
      addTiles(L, map);
      L.control.zoom({ position: "topright" }).addTo(map);
      map.fitBounds(MAIN_BOUNDS, {
        animate: false,
        paddingBottomRight: [28, 28],
        paddingTopLeft: [28, 28],
      });
      addDestination(L, map, true);
      // Every departure remains a real Leaflet marker on the main map.
      // The inset is only an additional view for cities outside the initial
      // France/Belgium/Portugal framing; it never replaces their main marker.
      addCityLayers(L, map, groups, timers, reducedMotion);

      if (distantGroups.length && insetElementRef.current) {
        insetMap = L.map(insetElementRef.current, {
          attributionControl: false,
          dragging: true,
          scrollWheelZoom: false,
          touchZoom: true,
          zoomControl: false,
          zoomSnap: 0.25,
        });
        addTiles(L, insetMap);
        addDestination(L, insetMap, false);
        addCityLayers(
          L,
          insetMap,
          distantGroups,
          timers,
          reducedMotion,
          true,
        );
        const insetBounds = L.latLngBounds([
          [MASSACAN.latitude, MASSACAN.longitude],
          ...distantGroups.map(
            (route) => [route.latitude, route.longitude] as [number, number],
          ),
        ]);
        insetMap.fitBounds(insetBounds, { animate: false, padding: [22, 22] });
      }
    }

    void initialiseMaps();

    return () => {
      disposed = true;
      timers.forEach((timer) => clearTimeout(timer));
      map?.remove();
      insetMap?.remove();
    };
  }, [distantGroups, groups, routes]);

  return (
    <section className={styles.section} aria-labelledby="guest-map-title">
      <div className={styles.heading}>
        <div>
          <p className={styles.kicker}>La carte collective</p>
          <h2 id="guest-map-title">Les compagnons de route</h2>
          <p className={styles.subtitle}>
            D’un peu partout, toutes les routes finissent par se rejoindre.
          </p>
        </div>
        {routes !== null && routes.length > 0 && (
          <p className={styles.counter} aria-live="polite">
            <strong>{groups.length}</strong> ville{groups.length > 1 ? "s" : ""}
            <span aria-hidden="true"> · </span>
            <strong>{routes.length}</strong> départ{routes.length > 1 ? "s" : ""}
          </p>
        )}
      </div>

      <div className={styles.mapShell}>
        <div
          className={styles.map}
          ref={mapElementRef}
          role="region"
          aria-label="Carte interactive des villes de départ des invités vers le Domaine du Massacan"
        />

        {distantGroups.length > 0 && (
          <aside className={styles.inset} aria-label="Départs lointains">
            <div className={styles.insetHeading}>
              <span>Hors cadre</span>
              <strong>Départs lointains</strong>
            </div>
            <div
              className={`${styles.map} ${styles.insetMap}`}
              ref={insetElementRef}
              role="region"
              aria-label="Carte des invités venant de destinations éloignées"
            />
          </aside>
        )}

        {routes === null && (
          <div className={styles.loading} role="status">
            <span />
            Les itinéraires se dessinent…
          </div>
        )}
      </div>

      {loadError && (
        <p className={styles.notice} role="status">
          La carte n’a pas pu charger les départs pour le moment. Le Domaine du
          Massacan reste affiché comme point d’arrivée.
        </p>
      )}
      {!loadError && routes !== null && routes.length === 0 && (
        <p className={styles.notice}>
          Le premier vélo apparaîtra dès qu’une inscription sera enregistrée.
        </p>
      )}
      <p className={styles.hint}>
        Survolez un vélo — ou touchez-le sur mobile — pour découvrir son départ.
      </p>
    </section>
  );
}
