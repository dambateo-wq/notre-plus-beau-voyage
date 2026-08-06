import Image from "next/image";
import WeddingCountdown from "./components/WeddingCountdown";

const programme = [
  { day: "Vendredi", time: "17h", title: "Premiers pas à Massacan", text: "Installation, pizzas, baignade et soirée libre sous les pins." },
  { day: "Samedi", time: "14h", title: "Rendez-vous au Revest", text: "Un transport dédié partira du domaine pour l’église." },
  { day: "Samedi", time: "18h", title: "Cocktail dans la pinède", text: "La Méditerranée en contrebas, vous tous autour de nous." },
  { day: "Samedi", time: "20h → 3h", title: "Dîner, danse & plage", text: "Le repas, la piste de danse, puis une fin de nuit au bord de l’eau." },
  { day: "Dimanche", time: "11h", title: "Dernier festin", text: "Food truck et une journée à ralentir, jusqu’à 16h." },
];

export default function Home() {
  return (
    <main>
      <nav className="v2-nav" aria-label="Navigation principale">
        <a className="v2-brand" href="#top">D&J <span>•</span> 2027</a>
        <div className="v2-nav-links">
          <a href="#programme">Programme</a>
          <a href="#venir">Venir</a>
          <a href="#reponse">Répondre</a>
        </div>
        <a className="v2-nav-cta" href="#reponse">Inscription</a>
      </nav>

      <section className="v2-hero" id="top">
        <Image className="v2-hero-image" src="/domaine.jpg" alt="Domaine du Massacan" fill priority sizes="100vw" />
        <div className="v2-hero-shade" />
        <div className="v2-hero-content">
          <p className="v2-kicker">29 & 30 mai 2027 · Domaine du Massacan</p>
          <h1>Notre plus<br /><em>beau voyage</em></h1>
          <p className="v2-names">Damien & Julie</p>
          <div className="v2-hero-actions">
            <a className="v2-button v2-button-light" href="#reponse">Répondre au voyage <span>↗</span></a>
            <a className="v2-text-link" href="#programme">Découvrir le programme <span>↓</span></a>
          </div>
        </div>
        <WeddingCountdown />
        <p className="v2-scroll">Faire défiler <span>↓</span></p>
      </section>

      <section className="v2-intro v2-reveal">
        <p className="v2-kicker v2-kicker-dark">Une parenthèse au sud</p>
        <h2>Toutes les routes nous ont menés jusqu’ici.<br /><em>Il ne manque plus que vous.</em></h2>
        <p>Trois jours à respirer l’air marin, rire très fort, danser pieds nus et célébrer ce qui compte vraiment.</p>
      </section>

      <section className="v2-domaine v2-reveal" id="domaine">
        <div className="v2-domaine-photo"><Image src="/domaine.jpg" alt="" fill sizes="(max-width: 800px) 100vw, 50vw" /></div>
        <div className="v2-domaine-copy">
          <p className="v2-kicker v2-kicker-dark">Le domaine</p>
          <h2>Entre pinède<br />et <em>Méditerranée</em></h2>
          <p>Un parc de trois hectares, un accès privé à la plage de Magaud et une grande maison qui sera la nôtre, le temps d’un week-end.</p>
          <div className="v2-facts"><span>3 hectares<br /><b>de nature</b></span><span>à quelques pas<br /><b>de la mer</b></span><span>28 → 30 mai<br /><b>rien que nous</b></span></div>
        </div>
      </section>

      <section className="v2-programme v2-reveal" id="programme">
        <div className="v2-section-head"><p className="v2-kicker v2-kicker-dark">L’itinéraire</p><h2>Le programme<br />du <em>voyage</em></h2><p>Quelques repères, beaucoup de moments à inventer ensemble.</p></div>
        <div className="v2-timeline">
          {programme.map((item, index) => <article className="v2-timeline-stop" key={item.title}>
            <div className="v2-timeline-index">0{index + 1}</div><div className="v2-timeline-line" />
            <div><p className="v2-stop-meta">{item.day} · {item.time}</p><h3>{item.title}</h3><p>{item.text}</p></div>
          </article>)}
        </div>
      </section>

      <section className="v2-rsvp v2-reveal" id="reponse">
        <Image src="/domaine.jpg" alt="" fill sizes="100vw" />
        <div className="v2-rsvp-shade" />
        <div className="v2-rsvp-copy"><p className="v2-kicker">Votre siège est prêt</p><h2>Prêts à prendre<br /><em>la route ?</em></h2><p>Votre réponse nous aide à préparer chaque détail de cette aventure.</p><a className="v2-button v2-button-light" href="#inscription">Répondre au voyage <span>↗</span></a></div>
      </section>

      <section className="v2-travel v2-reveal" id="venir">
        <div className="v2-section-head"><p className="v2-kicker v2-kicker-dark">Comment venir</p><h2>Choisissez<br /><em>votre chemin</em></h2></div>
        <div className="v2-travel-cards">
          <article><span>01</span><div className="v2-travel-icon">⌁</div><h3>En voiture</h3><p>Cap sur le Domaine du Massacan, à La Garde. Les informations de stationnement arriveront dans les infos pratiques.</p><a href="#infos-pratiques">Voir les infos pratiques →</a></article>
          <article><span>02</span><div className="v2-travel-icon">✈</div><h3>En avion</h3><p>Toulon–Hyères est le plus proche. Marseille Provence offre davantage de possibilités depuis la Belgique et le nord.</p><a href="#covoiturage">Trouver un covoiturage →</a></article>
          <article><span>03</span><div className="v2-travel-icon">↝</div><h3>En train</h3><p>Arrivée gare de Toulon, puis le réseau Mistral vous emmène jusqu’au domaine.</p><a href="#infos-pratiques">Préparer son trajet →</a></article>
        </div>
      </section>

      <section className="v2-carpool v2-reveal" id="covoiturage">
        <div><p className="v2-kicker v2-kicker-dark">À plusieurs, c’est mieux</p><h2>Partageons<br />la <em>route</em></h2><p>Un siège libre, un trajet à chercher, une playlist à choisir : l’espace covoiturage sera votre point de rendez-vous.</p><button className="v2-button v2-button-dark" type="button">Découvrir le covoiturage <span>↗</span></button></div>
        <div className="v2-ride-preview"><div className="v2-ride-route"><span>Bruxelles</span><i /><span>Massacan</span></div><div className="v2-ride-card"><div className="v2-avatar">J</div><div><b>Votre prochain trajet</b><small>Les propositions apparaîtront ici</small></div><span>→</span></div></div>
      </section>

      <section className="v2-map-placeholder v2-reveal">
        <p className="v2-kicker v2-kicker-dark">La carte collective</p><h2>Nos vélos arriveront<br /><em>bientôt ici.</em></h2><p>La carte des départs fera partie de la prochaine étape du voyage.</p><div className="v2-map-lines"><span>✦</span><i /><span>♧</span><i /><span>🚲</span></div>
      </section>

      <section className="v2-practical v2-reveal" id="infos-pratiques">
        <p className="v2-kicker v2-kicker-dark">Bien préparer le départ</p><h2>Infos <em>pratiques</em></h2>
        <div><article><b>Enfants</b><p>À l’exception de la famille, nous vous demanderons de venir sans vos rejetons.</p></article><article><b>Parking</b><p>25 places au domaine et un parking extérieur juste devant.</p></article><article><b>Dress code</b><p>Le cocktail se déroule dans le parc : attention aux talons hauts.</p></article><article><b>À glisser dans le sac</b><p>Maillot, serviette et tenue de sport selon vos envies.</p></article></div>
      </section>

      <section className="v2-stay v2-reveal" id="hebergement">
        <div className="v2-stay-photo"><Image src="/domaine.jpg" alt="" fill sizes="(max-width: 800px) 100vw, 50vw" /></div>
        <div><p className="v2-kicker v2-kicker-dark">Dormir au domaine</p><h2>Prolongez<br /><em>l’histoire</em></h2><p>Des chambres de 2 à 5 lits simples, à partager jusqu’au dimanche. 35 € par personne et par nuit.</p><div className="v2-availability"><span><b>106</b> places invitées</span><span><b>35 €</b> par nuit</span></div><button className="v2-button v2-button-dark" type="button">Réserver une nuitée <span>↗</span></button></div>
      </section>

      <footer className="v2-footer"><div><p>Damien & Julie</p><span>29 & 30 mai 2027 · Domaine du Massacan</span></div><span className="v2-bike">⌁</span><a href="#top">Retour en haut ↑</a></footer>
    </main>
  );
}
