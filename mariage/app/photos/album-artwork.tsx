import Image from "next/image";
import styles from "./photos.module.css";

type Sketch = "olive" | "sun" | "waves" | "bike" | "pine" | "signpost";

function TravelSketch({ kind }: { kind: Sketch }) {
  return <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === "olive" && <>
      <path d="M31 84c16-20 24-40 35-68M42 65l-8-9M51 47l-8-9M58 32l-5-8" />
      <path d="M40 68c-17 1-20-11-17-18 8 2 15 7 17 18ZM47 54c-15-1-18-12-14-18 8 2 13 9 14 18ZM55 36c-11-3-13-14-8-20 7 5 10 11 8 20ZM56 43c1-12 10-19 18-17-1 8-8 15-18 17ZM48 61c4-12 14-15 21-11-5 8-12 11-21 11ZM38 76c6-10 16-11 23-7-6 7-14 9-23 7ZM63 23c-1-9 3-15 9-18 2 8-1 14-9 18Z" />
    </>}
    {kind === "sun" && <><circle cx="50" cy="50" r="16" /><path d="M50 15v9m0 52v9M15 50h9m52 0h9M25 25l7 7m36 36 7 7M25 75l7-7m36-36 7-7M37 17l3 8m20 50 3 8M17 63l8-3m50-20 8-3M17 37l8 3m50 20 8 3M37 83l3-8m20-50 3-8" /></>}
    {kind === "waves" && <path d="M15 35c8 0 8-5 16-5s8 5 16 5 8-5 16-5 8 5 22 5M15 51c8 0 8-5 16-5s8 5 16 5 8-5 16-5 8 5 22 5M15 67c8 0 8-5 16-5s8 5 16 5 8-5 16-5 8 5 22 5" />}
    {kind === "bike" && <><circle cx="23" cy="66" r="16" /><circle cx="78" cy="66" r="16" /><path d="m23 66 15-31 19 31H23Zm15-31h28L57 66m21 0L63 23h-9M32 28h13m16-9h10l3 6-2 7" /><circle cx="57" cy="66" r="3" /><path d="m57 66 6 6h5" /></>}
    {kind === "pine" && <>
      <path d="M8 75c25-8 44 3 84-6m-84 15c21-6 48 3 84-4" stroke="#aab8b1" />
      <path d="M46 80c4-20 1-36 1-49m1 23L29 32m19 11 20-15M45 57l-9-14" stroke="#75664c" strokeWidth="2.2" />
      <path d="M16 31c-5-5-2-10 4-10-2-8 7-13 13-8 1-9 12-11 17-5 6-8 16-4 18 2 8-3 16 2 15 10 8 0 9 10 2 13-20 8-47 12-69-2Z" fill="#778568" stroke="#778568" />
      <path d="M20 30c14 6 38 8 59-3" stroke="#a4ad87" /><path d="m65 74 6-3 10 2M11 80l8-2 8 3" stroke="#a99a7d" />
    </>}
    {kind === "signpost" && <><path d="M47 84V60m8 24V60M47 19v-7h8v7M18 21h56l12 11-12 10H18V21Zm64 26H26L14 58l12 10h56V47Z" /><path d="M27 31h42M32 57h39M43 85h17" /></>}
  </svg>;
}

export function AlbumArtwork({ guest = false, comingSoon = false }: { guest?: boolean; comingSoon?: boolean }) {
  const sketches: Sketch[] = guest ? ["bike", "pine", "signpost"] : ["olive", "sun", "waves"];
  return <div className={styles.albumImages}>
    <div className={styles.cover}>
      <Image src={`/images/photos/${guest ? "guest" : "official"}-journal.webp`}
        alt={guest ? "Illustration méditerranéenne : appareil photo instantané sur un muret, mer et branches d’olivier" : "Illustration méditerranéenne : pin parasol, mer et îles dans la lumière du soleil couchant"}
        fill sizes="(max-width: 759px) 90vw, (max-width: 1199px) 52vw, 600px" />
      {(guest || comingSoon) && <span className={`${styles.handwritten} ${guest ? styles.guestNote : styles.officialNote}`}>
        {guest ? <>Vos souvenirs<br />ici !<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M24 40S6 28 6 16C6 4 21 6 24 17 27 6 42 4 42 16c0 12-18 24-18 24Z" /></svg></> : "À venir…"}
      </span>}
    </div>
    <span className={styles.albumLabel}>Carnet {guest ? "02 · Ensemble" : "01 · Le mariage"}</span>
    <div className={styles.thumbnails} aria-hidden="true">
      {sketches.map(kind => <div className={`${styles.polaroid} ${styles[kind]}`} key={kind}><div><TravelSketch kind={kind} /></div></div>)}
    </div>
  </div>;
}
