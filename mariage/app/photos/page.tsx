import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { photosAuthenticated, photosPasswordConfigured } from "@/lib/photos-auth";
import { officialPhotosPublished, photosAlbums } from "@/lib/photos-config";
import { enterPhotos, leavePhotos } from "./actions";
import { AlbumArtwork } from "./album-artwork";
import styles from "./photos.module.css";

export const metadata: Metadata = { title: "Nos souvenirs | Damien & Julie", robots: { index: false, follow: false } };

function AlbumComingSoon() {
  return <div className={styles.unavailable}>
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="7" width="22" height="22" rx="3" /><path d="M10 3v8m12-8v8M5 14h22" /></svg>
    <div><h3>Album à venir</h3><p>Nous le partagerons après le mariage.</p></div>
  </div>;
}

function AlbumLink({ url, children, secondary = false }: { url: string; children: React.ReactNode; secondary?: boolean }) {
  return <a className={secondary ? styles.secondaryButton : `v2-button v2-button-dark ${styles.albumButton}`} href={url} target="_blank" rel="noopener noreferrer">{children}<span aria-hidden="true">↗</span><span className={styles.srOnly}> sur Google Photos, dans un nouvel onglet</span></a>;
}

export default async function Photos({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const authenticated = await photosAuthenticated();
  const configured = photosPasswordConfigured();
  const { error } = await searchParams;
  const albums = authenticated ? photosAlbums() : null;
  const officialAvailable = Boolean(albums?.official && officialPhotosPublished());
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
        <article className={styles.album} aria-labelledby="official-album-title"><AlbumArtwork comingSoon={!officialAvailable} /><div className={styles.albumCopy}><p className={styles.eyebrow}>Le mariage à travers son regard</p><h2 id="official-album-title">Les photos<br /><em>de notre photographe</em></h2><p className={styles.description}>Après le grand jour, retrouvez ici les photos du mariage prises par notre photographe.</p>
          <div className={styles.officialAction}>{officialAvailable && albums?.official ? <AlbumLink url={albums.official}>Découvrir l’album</AlbumLink> : <AlbumComingSoon />}</div>
        </div></article>
        <article className={styles.album} aria-labelledby="guest-album-title"><AlbumArtwork guest /><div className={styles.albumCopy}><p className={styles.eyebrow}>À travers vos yeux</p><h2 id="guest-album-title">Vos photos<br /><em>du week-end</em></h2><p className={styles.description}>Vous avez capturé un beau moment, une photo improbable ou simplement votre vision du week-end ? Partagez vos souvenirs avec nous.</p>
          {albums?.guest ? <><div className={styles.buttons}><AlbumLink url={albums.guest}>Ajouter mes photos</AlbumLink><AlbumLink url={albums.guest} secondary>Voir les photos sur Google Photos</AlbumLink></div>
            <div className={styles.qr}><a href={albums.guest} target="_blank" rel="noopener noreferrer" aria-label="Rejoindre l’album Google Photos des invités"><Image src="/photos/qr" alt="QR code vers l’album Google Photos des invités" width={176} height={176} unoptimized /></a><div><p><strong>Scannez le QR code</strong><span>Pour rejoindre directement l’album et partager vos photos depuis votre téléphone.</span></p></div></div>
            <a className={styles.qrDownload} href="/photos/qr?download" download="photos-du-week-end-qr.png"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" /></svg>Télécharger le QR code (PNG)</a>
            <p className={styles.hint}>Google Photos peut vous demander de vous connecter à votre compte Google pour ajouter vos photos.</p>
          </> : <p className={styles.guestUnavailable}>L’album du week-end sera bientôt disponible.</p>}
        </div></article>
      </div>
      <aside className={styles.privacy}>Le mot de passe protège uniquement cet espace du site. Les albums Google Photos sont accessibles aux personnes disposant de leur lien de partage.</aside>
      <form action={leavePhotos} className={styles.logout}><button type="submit">Fermer ma session Photos</button></form>
    </>}
    <footer className={styles.footer}>Damien & Julie · 29 & 30 mai 2027</footer>
  </main>;
}
