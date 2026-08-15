import Image from "next/image";
import WeddingCountdown from "./components/WeddingCountdown";
import WeddingSurvey from "./components/WeddingSurvey";
import RsvpReminder from "./components/RsvpReminder";
import GuestJourneyMap from "./components/GuestJourneyMap";
import CarpoolBoard from "./components/CarpoolBoard";
import HoneymoonContribution from "./components/HoneymoonContribution";

const programme = [
  { day: "Vendredi 28 mai", time: "Matin", title: "Mariage à la mairie", text: "Pour les personnes informées, suivi d’un restaurant au Revest." },
  { day: "Vendredi 28 mai", time: "17h", title: "Arrivée au Domaine de Massacan", text: "Installation, soirée libre, pizzas, mise en place et première baignade." },
  { day: "Samedi 29 mai", time: "Matin", title: "Petit déjeuner & activités", text: "Volley, course à pied, pétanque et baignade." },
  { day: "Samedi 29 mai", time: "14h · à confirmer", title: "Rendez-vous à l’église du Revest", text: "Un transport dédié sera mis à disposition depuis le domaine." },
  { day: "Samedi 29 mai", time: "18h", title: "Début du cocktail", text: "Dans la pinède, en bord de mer." },
  { day: "Samedi 29 mai", time: "20h", title: "Début du repas", text: "Le dîner tous ensemble, avant de rejoindre la piste." },
  { day: "Samedi 29 mai", time: "22h", title: "Ouverture de la piste de danse", text: "La nuit est à nous." },
  { day: "Dimanche 30 mai", time: "3h", title: "La fête continue sur la plage", text: "Fermeture de la piste, puis rendez-vous sur la plage avec projecteurs, enceintes et Phoenix." },
  { day: "Dimanche 30 mai", time: "11h", title: "Food truck", text: "On se retrouve tranquillement pour prolonger le week-end." },
  { day: "Dimanche 30 mai", time: "16h", title: "Fin du week-end", text: "Derniers moments chill avant de libérer le domaine." },
];

export default function Home() {
  return (
    <main>
      <nav className="v2-nav" aria-label="Navigation principale">
        <a className="v2-brand" href="#top"><span className="v2-brand-mark">D&J</span><span className="v2-brand-separator">•</span><span className="v2-brand-date">2027</span></a>
        <div className="v2-nav-links">
          <a href="#domaine">Domaine</a>
          <a href="#programme">Programme</a>
          <a href="#inscription">Inscription</a>
          <div className="v2-nav-dropdown">
            <button type="button">Préparer le départ <span>⌄</span></button>
            <div className="v2-nav-submenu">
              <a href="#venir"><span>01</span> Venir</a>
              <a href="#covoiturage"><span>02</span> Covoiturage</a>
              <a href="#infos-pratiques"><span>03</span> Infos pratiques</a>
              <a href="#voyage-de-noces"><span>04</span> Participer au voyage de noces</a>
            </div>
          </div>
        </div>
        <details className="v2-mobile-nav">
          <summary>Menu</summary>
          <div>
            <a href="#domaine">Domaine</a>
            <a href="#programme">Programme</a>
            <a href="#inscription">Inscription</a>
            <span>Préparer le départ</span>
            <a href="#venir">Venir</a>
            <a href="#covoiturage">Covoiturage</a>
            <a href="#infos-pratiques">Infos pratiques</a>
            <a href="#voyage-de-noces">Participer au voyage de noces</a>
          </div>
        </details>
      </nav>

      <section className="v2-hero" id="top">
        <Image className="v2-hero-image" src="/domaine.jpg" alt="Domaine du Massacan" fill priority sizes="100vw" />
        <div className="v2-hero-shade" />
        <div className="v2-hero-content">
          <p className="v2-kicker v2-hero-event">29 mai 2027 · Domaine du Massacan · La Garde</p>
          <p className="v2-hero-signature">Les Dadju&apos;s</p>
          <h1>Notre plus<br /><em>beau voyage</em></h1>
          <p className="v2-names">Damien & Julie</p>
          <a className="v2-hero-discover" href="#voyage-photo">Découvrir l&apos;aventure <span>↓</span></a>
        </div>
        <WeddingCountdown />
      </section>

      <section className="v2-journey-photo v2-reveal" id="voyage-photo" aria-label="Notre voyage">
        <Image src="/voyage.jpg" alt="Damien et Julie au bord d’un lac de montagne avec leurs vélos" fill priority sizes="100vw" />
        <div className="v2-journey-shade" />
        <div className="v2-journey-copy">
          <p className="v2-kicker">Carnet de voyage · Une histoire à deux</p>
          <h2>Toutes les routes nous ont<br /><em>menés jusqu’ici…</em></h2>
        </div>
        <span className="v2-journey-caption">Et la prochaine étape, c’est avec vous.</span>
      </section>

      <GuestJourneyMap />

      <section className="v2-intro v2-reveal">
        <p className="v2-kicker v2-kicker-dark">Une parenthèse au sud</p>
        <h2>Trois jours pour<br /><em>écrire la suite.</em></h2>
        <p>Trois jours à respirer l’air marin, rire très fort, danser pieds nus et célébrer ce qui compte vraiment.</p>
      </section>

      <section className="v2-domaine v2-reveal" id="domaine">
        <div className="v2-domaine-photo"><Image src="/massacan-paysage.jpg" alt="La Méditerranée au pied du Domaine de Massacan" fill sizes="(max-width: 800px) 100vw, 50vw" /></div>
        <div className="v2-domaine-copy">
          <p className="v2-kicker v2-kicker-dark">Domaine</p>
          <h2>Entre pinède<br />et <em>Méditerranée</em></h2>
          <p>Un parc de trois hectares, un accès privé à la plage de Magaud et une grande maison qui sera la nôtre, le temps d’un week-end.</p>
          <div className="v2-facts"><span>3 hectares<br /><b>de nature</b></span><span>à quelques pas<br /><b>de la mer</b></span><span>28 → 30 mai<br /><b>rien que nous</b></span></div>
        </div>
      </section>

      <section className="v2-programme v2-reveal" id="programme">
        <div className="v2-section-head"><p className="v2-kicker v2-kicker-dark">Programme</p><h2>Le programme<br />du <em>voyage</em></h2><p>Quelques repères, beaucoup de moments à inventer ensemble.</p></div>
        <div className="v2-timeline">
          {programme.map((item, index) => <article className="v2-timeline-stop" key={item.title}>
            <div className="v2-timeline-index">{String(index + 1).padStart(2, "0")}</div><div className="v2-timeline-line" />
            <div><p className="v2-stop-meta">{item.day} · {item.time}</p><h3>{item.title}</h3><p>{item.text}</p></div>
          </article>)}
        </div>
      </section>

      <section className="v2-rsvp v2-reveal" id="inscription">
        <Image src="/velo-route.jpg" alt="Damien et Julie à vélo pendant leur voyage" fill sizes="100vw" />
        <div className="v2-rsvp-shade" />
        <div className="v2-rsvp-copy"><p className="v2-kicker">Inscription</p><h2>Prêts à prendre<br /><em>la route ?</em></h2><p>Votre réponse nous aide à préparer chaque détail de cette aventure.</p><a className="v2-button v2-button-light" href="#sondage">Commencer l&apos;inscription <span>↓</span></a></div>
      </section>

      <WeddingSurvey />
      <RsvpReminder />

      <section className="v2-travel v2-reveal" id="venir">
        <div className="v2-section-head"><p className="v2-kicker v2-kicker-dark"><span className="v2-section-number">01</span> Venir</p><h2>Choisissez<br /><em>votre chemin</em></h2></div>
        <div className="v2-travel-cards">
          <article><span>01</span><div className="v2-travel-icon">⌁</div><h3>En voiture</h3><p><strong>Domaine de Massacan</strong><br />1589 avenue du Commandant Houot<br />83130 La Garde</p><p>Pour le stationnement, rendez-vous dans l’onglet <a href="#infos-pratiques">Infos pratiques</a>.</p><a className="v2-card-link" href="#infos-pratiques">Voir les infos pratiques →</a></article>
          <article><span>02</span><div className="v2-travel-icon">✈</div><h3>En avion</h3><p><strong>Depuis la Belgique et le nord de la France</strong></p><p>Toulon–Hyères est l’aéroport le plus proche du domaine, à environ 30 minutes en voiture. Marseille Provence offre davantage de vols et se situe à environ 1 h 15 du domaine.</p><p>Au départ de Charleroi, Bruxelles ou Lille, plusieurs compagnies desservent ces deux aéroports selon la saison.</p><p>Une fois sur place : louez une voiture pour profiter du week-end et de la région, ou utilisez notre espace <a href="#covoiturage">Covoiturage</a> pour partager un trajet avec d’autres invités.</p><a className="v2-card-link" href="#covoiturage">Voir les covoiturages →</a></article>
          <article><span>03</span><div className="v2-travel-icon">↝</div><h3>En train</h3><p>Arrivez à la gare de Toulon, puis empruntez les lignes <strong>36, 2 ou 29</strong> du réseau Mistral.</p></article>
        </div>
      </section>

      <CarpoolBoard />

      <section className="v2-practical v2-reveal" id="infos-pratiques">
        <div className="v2-practical-intro">
          <div>
            <p className="v2-kicker v2-kicker-dark"><span className="v2-section-number">03</span> Infos pratiques</p>
            <h2>Bien préparer<br /><em>le départ</em></h2>
          </div>
          <div className="v2-practical-photo">
            <Image src="/bivouac-selfie.jpg" alt="Damien et Julie en voyage à vélo" fill sizes="(max-width: 759px) calc(100vw - 44px), 430px" />
          </div>
        </div>
        <div className="v2-practical-grid"><article><b>Enfants</b><p>Nous sommes sincèrement désolés, mais la capacité d’accueil du domaine est limitée. À l’exception de la famille, nous vous demanderons donc de venir sans vos rejetons.</p></article><article><b>Parking</b><p>Le domaine compte 25 places de parking. Un parking extérieur, non privatisé, se trouve également juste devant : si une place y est disponible à votre arrivée, n’hésitez pas à la privilégier.</p></article><article><b>Dress code</b><p>Une seule chose à garder en tête : le cocktail se déroule dans le parc. Attention aux talons hauts !</p></article><article><b>À ne pas oublier</b><p>Maillot de bain, serviette et tenue de sport pour celles et ceux qui le souhaitent.</p></article></div>
        <p className="v2-practical-contact">Évidemment, n’hésitez pas à nous contacter pour toute question.</p>
      </section>

      <HoneymoonContribution />

      <footer className="v2-footer"><div><p>Damien & Julie</p><span>29 & 30 mai 2027 · Domaine du Massacan</span></div><span className="v2-bike">⌁</span><div className="v2-footer-links"><a href="/admin" aria-label="Accès administrateur">🔒 Admin</a><a href="#top">Retour en haut ↑</a></div></footer>
    </main>
  );
}
