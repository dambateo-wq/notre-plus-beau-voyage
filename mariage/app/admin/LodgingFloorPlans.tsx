import Image from "next/image";
import { getRoomCapacity } from "@/lib/lodging-rooms";
import styles from "./admin.module.css";

type Assignment = {
  reservation_id: string;
  room_name: string;
  friday_adults: number;
  friday_children: number;
  friday_babies: number;
  saturday_adults: number;
  saturday_children: number;
  saturday_babies: number;
};

type Reservation = {
  id: string;
  booker_name: string;
  guest_names: string[];
  booking_status: string;
};

type RoomPoint = { name: string; x: number; y: number };

const PLAN_A: RoomPoint[] = [
  { name: "A1", x: 84.5, y: 30 }, { name: "A2", x: 84.5, y: 50.5 },
  { name: "A3", x: 84.5, y: 73 }, { name: "A4", x: 66, y: 79 },
  { name: "A5", x: 49.5, y: 79 }, { name: "A6", x: 48, y: 30 },
  { name: "A7", x: 32, y: 49 }, { name: "A8", x: 32, y: 71.5 },
  { name: "A9", x: 16, y: 49 }, { name: "A10", x: 16, y: 71.5 },
  { name: "A11", x: 58.5, y: 54.5 }, { name: "A12", x: 65, y: 30 },
];

const PLAN_B: RoomPoint[] = [
  { name: "B1", x: 32.5, y: 18 }, { name: "B2", x: 45.5, y: 18 },
  { name: "B3", x: 45.5, y: 27 }, { name: "B4", x: 45.5, y: 36 },
  { name: "B5", x: 32, y: 36 }, { name: "B6", x: 45.5, y: 45.5 },
  { name: "B7", x: 32, y: 45.5 }, { name: "B8", x: 45.5, y: 54 },
  { name: "B9", x: 32, y: 63 }, { name: "B10", x: 43.5, y: 62 },
  { name: "B11", x: 48, y: 65 }, { name: "B12", x: 45.5, y: 72 },
  { name: "B13", x: 32, y: 72 }, { name: "B14", x: 45.5, y: 81 },
  { name: "B15", x: 40, y: 90 },
];

const PLAN_LAURIERS: RoomPoint[] = [
  { name: "LAURIERS HAUT", x: 64, y: 28 },
  { name: "LAURIERS BAS", x: 45, y: 50 },
  { name: "LAURIERS TERRASSE", x: 46, y: 70 },
];

const PLAN_YUCCAS: RoomPoint[] = [
  { name: "YUCCAS STUDIO", x: 58, y: 61 },
  { name: "YUCCAS CHAMBRE", x: 48, y: 79 },
];

const plans = [
  { title: "Bâtiment A", src: "/admin-plans/batiment-a.png", width: 1521, height: 1075, rooms: PLAN_A, landscape: true },
  { title: "Bâtiment B", src: "/admin-plans/batiment-b.png", width: 1075, height: 1521, rooms: PLAN_B, landscape: false },
  { title: "Gîte Les Lauriers", src: "/admin-plans/gite-lauriers.png", width: 1105, height: 1430, rooms: PLAN_LAURIERS, landscape: false },
  { title: "Gîtes Palmiers & Yuccas", src: "/admin-plans/gites-palmier-yuccas.png", width: 1105, height: 1430, rooms: PLAN_YUCCAS, landscape: false },
] as const;

const detailPlans = [
  { title: "B1 à B5", src: "/admin-plans/detail-b1-b5.png" },
  { title: "B6 à B11", src: "/admin-plans/detail-b6-b11.png" },
  { title: "B12 à B15", src: "/admin-plans/detail-b12-b15.png" },
];

export default function LodgingFloorPlans({
  assignments,
  reservations,
}: {
  assignments: Assignment[];
  reservations: Reservation[];
}) {
  const reservationsById = new Map(
    reservations
      .filter((reservation) => reservation.booking_status === "active")
      .map((reservation) => [reservation.id, reservation]),
  );
  const occupancy = new Map<string, { names: string[]; friday: number; saturday: number }>();

  assignments.forEach((assignment) => {
    const reservation = reservationsById.get(assignment.reservation_id);
    if (!reservation) return;
    const current = occupancy.get(assignment.room_name) ?? { names: [], friday: 0, saturday: 0 };
    const names = reservation.guest_names.map((name) => name.trim()).filter(Boolean);
    current.names.push(...(names.length ? names : [reservation.booker_name]));
    current.friday += assignment.friday_adults + assignment.friday_children + assignment.friday_babies;
    current.saturday += assignment.saturday_adults + assignment.saturday_children + assignment.saturday_babies;
    occupancy.set(assignment.room_name, current);
  });

  return (
    <section className={styles.floorPlans} id="plans-hebergement" aria-labelledby="floor-plans-title">
      <div className={styles.floorPlansHeading}>
        <div>
          <p className={styles.eyebrow}>Plan de placement</p>
          <h3 id="floor-plans-title">Qui dort où ?</h3>
        </div>
        <p>Les noms apparaissent automatiquement sur le plan dès qu’une réservation payée est placée.</p>
      </div>

      <div className={styles.planGrid}>
        {plans.map((plan) => (
          <article className={styles.planCard} key={plan.title}>
            <div className={styles.planCardTitle}>
              <h4>{plan.title}</h4>
              {plan.title.includes("Palmiers") && <span>Palmiers réservé aux mariés</span>}
            </div>
            <div className={styles.planScroller}>
              <div className={`${styles.planCanvas} ${plan.landscape ? styles.planLandscape : styles.planPortrait}`}>
                <Image alt={`Plan ${plan.title}`} className={styles.planImage} height={plan.height} src={plan.src} width={plan.width} />
                {plan.rooms.map((room) => {
                  const placed = occupancy.get(room.name);
                  if (!placed) return null;
                  const capacity = getRoomCapacity(room.name);
                  return (
                    <div
                      aria-label={`${room.name} : ${placed.names.join(", ")}`}
                      className={styles.roomLabel}
                      key={room.name}
                      style={{ left: `${room.x}%`, top: `${room.y}%` }}
                      title={`${room.name} — ${placed.names.join(", ")}`}
                    >
                      <strong>{room.name}</strong>
                      <span>{placed.names.join(" · ")}</span>
                      <small>V {placed.friday}/{capacity} · S {placed.saturday}/{capacity}</small>
                    </div>
                  );
                })}
              </div>
            </div>
          </article>
        ))}
      </div>

      <details className={styles.detailPlans}>
        <summary>Détail des chambres du bâtiment B</summary>
        <p>Ces trois plans sont fournis uniquement comme repère pour la composition des chambres.</p>
        <div>
          {detailPlans.map((plan) => (
            <figure key={plan.src}>
              <Image alt={`Détail des chambres ${plan.title}`} height={1430} src={plan.src} width={1105} />
              <figcaption>{plan.title}</figcaption>
            </figure>
          ))}
        </div>
      </details>
    </section>
  );
}
