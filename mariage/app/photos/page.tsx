import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { photosAuthenticated, photosPasswordConfigured } from "@/lib/photos-auth";
import { photosAlbums } from "@/lib/photos-config";
import { enterPhotos, leavePhotos } from "./actions";
import styles from "./photos.module.css";

export const metadata: Metadata = { title: "Nos souvenirs | Damien & Julie", robots: { index: false, follow: false } };

function AlbumImages({ guest = false }: { guest?: boolean }) {
  return <div className={styles.albumImages}>
    <div className={styles.cover}><Image src={`/images/photos/${guest ? "guest" : "official"}-cover.jpg`} alt={guest ? "Damien et Julie en voyage à vélo" : "La Méditerranée au Domaine de Massacan"} fill sizes="(max-width: 759px) 90vw, 45vw" /></div>
    <div className={styles.thumbnails} aria-hidden="true">
      {["/voyage.jpg", "/domaine.jpg", "/velo-route.jpg"].map((src) => <div key={src}><Image src={src} alt="" fill sizes="120px" /></div>)}
    </div>
    <span className={styles.albumLabel}>Carnet {guest ? "02 · Ensemble" : "01 · À deux"}</span>
  </div>;
}

function AlbumLink({ url, children }: { url: string; children: React.ReactNode }) {
  return <a className="v2-button v2-button-dark" href={url} target="_blank" rel="noopener noreferrer">{children}<span aria-hidden="true">↗</span><span className={styles.srOnly}> sur Google Photos, dans un nouvel onglet</span></a>;
}

export default async function Photos({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const authenticated = await photosAuthenticated();
  const configured = photosPasswordConfigured();
  const { error } = await searchParams;
  const albums = authenticated ? photosAlbums() : null;
  return <main className={styles.page}>
    <header className={styles.nav}><Link href="/">D&J <span>· Le voyage</span></Link><Link href="/#photos">← Retour au site</Link></header>
    <div className={styles.heading}><p className="v2-kicker v2-kicker-dark">Photos · Damien & Julie</p><h1>Nos <em>souvenirs</em></h1><p>Parce que cette aventure mérite aussi son album.</p></div>
    {!authenticated ? <section className={styles.gate}>
      <div className={styles.gateImage}><Image src="/voyage.jpg" alt="Damien et Julie au bord d’un lac de montagne" fill sizes="(max-width: 759px) 90vw, 450px" /></div>
      <div className={styles.gateCopy}><p className="v2-kicker v2-kicker-dark">Une parenthèse entre nous</p><h2>Les souvenirs<br /><em>du voyage</em></h2>
        {configured ? <><p>Entrez le mot de passe pour accéder aux albums.</p><form action={enterPhotos} className={styles.form}>
          <label htmlFor="photos-password">Mot de passe</label><input id="photos-password" name="password" type="password" autoComplete="current-password" required maxLength={1024} aria-describedby={error ? "photos-error" : undefined} />
          {error && <p id="photos-error" role="alert" className={styles.error}>Le mot de passe est incorrect. Essayez à nouveau.</p>}
          <button className="v2-button v2-button-dark" type="submit">Entrer dans l’album <span aria-hidden="true">→</span></button>
        </form></> : <p>L’espace Photos sera bientôt accessible. Revenez nous voir un peu plus tard.</p>}
      </div>
    </section> : <>
      <div className={styles.albums}>
        <article className={styles.album}><AlbumImages /><div className={styles.albumCopy}><p className="v2-kicker v2-kicker-dark">Le mariage à travers son regard</p><h2>Les photos<br /><em>de notre photographe</em></h2><p>Après le grand jour, retrouvez ici les photos du mariage prises par notre photographe.</p>
          {albums?.official ? <AlbumLink url={albums.official}>Découvrir l’album</AlbumLink> : <p className={styles.unavailable}>L’album sera disponible après le mariage.</p>}
        </div></article>
        <article className={styles.album}><AlbumImages guest /><div className={styles.albumCopy}><p className="v2-kicker v2-kicker-dark">À travers vos yeux</p><h2>Vos photos<br /><em>du week-end</em></h2><p>Vous avez capturé un beau moment, une photo improbable ou simplement votre vision du week-end ? Partagez vos souvenirs avec nous.</p>
          {albums?.guest ? <><div className={styles.buttons}><AlbumLink url={albums.guest}>Ajouter mes photos</AlbumLink><a className={styles.textLink} href={albums.guest} target="_blank" rel="noopener noreferrer">Voir les photos sur Google Photos ↗</a></div>
            <p className={styles.hint}>Google Photos peut vous demander de vous connecter à votre compte Google pour ajouter vos photos.</p>
            <div className={styles.qr}><a href={albums.guest} target="_blank" rel="noopener noreferrer" aria-label="Rejoindre l’album Google Photos des invités"><Image src="/photos/qr" alt="QR code vers l’album Google Photos des invités" width={176} height={176} unoptimized /></a><div><p>Scannez le QR code pour rejoindre directement l’album et partager vos photos.</p><a className={styles.textLink} href="/photos/qr?download" download="photos-du-week-end-qr.png">Télécharger le QR code ↓</a></div></div>
          </> : <p className={styles.unavailable}>L’album du week-end sera bientôt disponible.</p>}
        </div></article>
      </div>
      <aside className={styles.privacy}>Le mot de passe protège uniquement cet espace du site. Les albums Google Photos sont accessibles aux personnes disposant de leur lien de partage.</aside>
      <form action={leavePhotos} className={styles.logout}><button type="submit">Fermer ma session Photos</button></form>
    </>}
    <footer className={styles.footer}>Damien & Julie · 29 & 30 mai 2027</footer>
  </main>;
}
