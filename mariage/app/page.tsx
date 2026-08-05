import WeddingSurvey from "./components/WeddingSurvey";
import CarpoolBoard from "./components/CarpoolBoard";
import RsvpReminder from "./components/RsvpReminder";
import WeddingCountdown from "./components/WeddingCountdown";
import LodgingBooking from "./components/LodgingBooking";

export default function Home() {
  return (
    <main>
      <section className="hero">
        <div className="hero-content">
          <p>29 & 30 mai 2027</p>
          <h1>Notre plus beau voyage</h1>
          <h2>Damien ❤️ Julie</h2>
          <p>Domaine du Massacan</p>
        </div>
        <WeddingCountdown />
      </section>

      <section className="section">
        <p className="eyebrow">Bienvenue</p>
        <h2>Toutes les routes nous ont menés jusqu’ici…</h2>
        <p>
          Il ne manque plus que vous pour partager avec nous ce week-end
          au Domaine du Massacan.
        </p>
      </section>

      <section className="section cards">
        <a className="card" href="#domaine">
          <span>🌿</span>
          <h3>Le Domaine</h3>
          <p>Découvrez le lieu, son parc et les espaces du mariage.</p>
        </a>

        <a className="card" href="#programme">
          <span>📅</span>
          <h3>Le programme</h3>
          <p>Trois jours de fête, de sport, de baignade et de danse.</p>
        </a>

        <a className="card registration-card" href="#sondage">
          <span>🚲</span>
          <h3>Inscription au voyage</h3>
          <p>Confirmez votre présence et vos souhaits pour le week-end.</p>
        </a>

        <a className="card" href="#venir">
          <span>🧭</span>
          <h3>Comment venir</h3>
          <p>Adresse, transports et itinéraires pour rejoindre le domaine.</p>
        </a>

        <a className="card" href="#covoiturage">
          <span>🚗</span>
          <h3>Covoiturage</h3>
          <p>Proposez ou recherchez un trajet avec les autres invités.</p>
        </a>

        <a className="card" href="#infos-pratiques">
          <span>ℹ️</span>
          <h3>Infos pratiques</h3>
          <p>Les derniers détails utiles pour profiter du week-end.</p>
        </a>

        <a className="card lodging-card" href="#hebergement">
          <span>🛏️</span>
          <h3>Réserver une nuitée</h3>
          <p>Réservez vos couchages au domaine et réglez à votre rythme.</p>
        </a>
      </section>

      <section className="domain-section" id="domaine">
        <div className="domain-copy">
          <p className="eyebrow">Le Domaine</p>
          <h2>Un écrin entre pinède et Méditerranée</h2>

          <p>
            Pour célébrer notre plus beau voyage, nous avons choisi un lieu où
            la nature rencontre la mer : le Domaine de Massacan.
          </p>

          <p>
            Niché au cœur d’un parc de trois hectares peuplé d’arbres
            centenaires, le domaine offre un cadre paisible et préservé à
            seulement quelques minutes de Toulon. Un chemin privé permet même
            de rejoindre directement la plage de Magaud pour profiter de la
            Méditerranée les pieds dans le sable.
          </p>

          <p>
            C’est ici, sous les pins et dans la douce lumière du Sud, que nous
            aurons le bonheur de vous retrouver. Le cocktail, le dîner et la
            fête se dérouleront au même endroit, entre jardins, grande terrasse
            et salle de réception.
          </p>

          <p>
            Et parce que nous souhaitons prolonger cette aventure avec vous, le
            domaine dispose de nombreux hébergements sur place. Après la fête,
            pas besoin de reprendre la route : nous pourrons nous retrouver le
            lendemain pour partager un brunch et savourer encore un peu ce
            week-end hors du temps.
          </p>

          <p className="domain-dates">
            Le domaine est à nous du 28 au 30 mai 2027 pour écrire ensemble
            l’une des plus belles étapes de notre voyage.
          </p>
        </div>

        <aside className="domain-highlights">
          <p className="eyebrow">Les petits plus du domaine</p>
          <ul>
            <li>Un parc arboré de trois hectares</li>
            <li>Un accès direct à la plage de Magaud</li>
            <li>Une cérémonie et un cocktail possibles sous les pins</li>
            <li>Une grande terrasse et une salle festive</li>
            <li>Environ une centaine de couchages sur place</li>
            <li>
              Un lieu engagé, labellisé « Esprit parc national de Port-Cros »
              et refuge LPO
            </li>
          </ul>
        </aside>
      </section>

      <section className="programme-section" id="programme">
        <div className="programme-intro">
          <p className="eyebrow">Le programme</p>
          <h2>Trois jours pour profiter ensemble</h2>
          <p>
            Voici le fil conducteur du week-end. Il pourra encore évoluer sur
            quelques détails, mais l’essentiel est là : prendre le temps, faire
            la fête et prolonger le voyage ensemble.
          </p>
        </div>

        <div className="programme-days">
          <article className="programme-day">
            <header>
              <p>Vendredi</p>
              <h3>28 mai</h3>
            </header>
            <ol>
              <li>
                <time>Matin</time>
                <div>
                  <h4>Mariage à la mairie</h4>
                  <p>
                    Pour les personnes informées, suivi d’un restaurant au
                    Revest.
                  </p>
                </div>
              </li>
              <li>
                <time>17h</time>
                <div>
                  <h4>Arrivée au Domaine de Massacan</h4>
                  <p>
                    Installation, soirée libre, pizzas, mise en place et
                    première baignade.
                  </p>
                </div>
              </li>
            </ol>
          </article>

          <article className="programme-day programme-day-featured">
            <header>
              <p>Samedi</p>
              <h3>29 mai</h3>
            </header>
            <ol>
              <li>
                <time>Matin</time>
                <div>
                  <h4>Petit déjeuner & activités</h4>
                  <p>Volley, course à pied, pétanque et baignade.</p>
                </div>
              </li>
              <li>
                <time>14h</time>
                <div>
                  <h4>Rendez-vous à l’église du Revest</h4>
                  <p>
                    Horaire à confirmer. Un transport dédié partira du domaine.
                  </p>
                </div>
              </li>
              <li>
                <time>18h</time>
                <div>
                  <h4>Début du cocktail</h4>
                  <p>Dans la pinède, en bord de mer.</p>
                </div>
              </li>
              <li>
                <time>20h</time>
                <div>
                  <h4>Début du repas</h4>
                </div>
              </li>
              <li>
                <time>22h</time>
                <div>
                  <h4>Ouverture de la piste de danse</h4>
                </div>
              </li>
            </ol>
          </article>

          <article className="programme-day">
            <header>
              <p>Dimanche</p>
              <h3>30 mai</h3>
            </header>
            <ol>
              <li>
                <time>3h</time>
                <div>
                  <h4>La fête continue sur la plage</h4>
                  <p>
                    Fermeture de la piste, puis rendez-vous sur la plage avec
                    projecteurs, enceintes et Phoenix.
                  </p>
                </div>
              </li>
              <li>
                <time>11h</time>
                <div>
                  <h4>Food truck</h4>
                </div>
              </li>
              <li>
                <time>16h</time>
                <div>
                  <h4>Fin du week-end</h4>
                  <p>Derniers moments chill avant de libérer le domaine.</p>
                </div>
              </li>
            </ol>
          </article>
        </div>
      </section>

      <WeddingSurvey />
      <RsvpReminder />

      <section className="travel-section" id="venir">
        <div className="travel-intro">
          <p className="eyebrow">Comment venir</p>
          <h2>Toutes les routes mènent à Massacan</h2>
          <p>Choisissez l’itinéraire qui vous convient le mieux. L’essentiel : arriver pour profiter du week-end avec nous.</p>
        </div>
        <div className="travel-options">
          <article><span>🚗</span><h3>En voiture</h3><p><strong>Domaine de Massacan</strong><br />1589 avenue du Commandant Houot<br />83130 La Garde</p><p>Pour le stationnement, rendez-vous dans l’onglet <a href="#infos-pratiques">Infos pratiques</a>.</p></article>
          <article><span>✈️</span><h3>En avion</h3><p><strong>Depuis la Belgique et le nord de la France</strong></p><p>Toulon–Hyères est l’aéroport le plus proche du domaine, à environ 30 minutes en voiture. Marseille Provence offre davantage de vols et se situe à environ 1 h 15 du domaine.</p><p>Au départ de Charleroi, Bruxelles ou Lille, plusieurs compagnies desservent ces deux aéroports selon la saison.</p><p>Une fois sur place : louez une voiture pour profiter du week-end et de la région, ou utilisez notre espace <a href="#covoiturage">Covoiturage</a> pour partager un trajet avec d’autres invités.</p></article>
          <article><span>🚆</span><h3>En train</h3><p>Arrivez à la gare de Toulon, puis empruntez les lignes <strong>36, 2 ou 29</strong> du réseau Mistral.</p></article>
        </div>
      </section>

      <CarpoolBoard />

      <section className="practical-section" id="infos-pratiques">
        <p className="eyebrow">Infos pratiques</p>
        <h2>Les petits détails qui font un week-end parfait</h2>
        <div className="practical-grid">
          <article>
            <span>🧸</span>
            <h3>Enfants</h3>
            <p>
              Nous sommes sincèrement désolés, mais la capacité d’accueil du
              domaine est limitée. À l’exception de la famille, nous vous
              demanderons donc de venir sans vos rejetons.
            </p>
          </article>
          <article>
            <span>🅿️</span>
            <h3>Parking</h3>
            <p>
              Le domaine compte 25 places de parking. Un parking extérieur,
              non privatisé, se trouve également juste devant : si une place y
              est disponible à votre arrivée, n’hésitez pas à la privilégier.
            </p>
          </article>
          <article>
            <span>👗</span>
            <h3>Dress code</h3>
            <p>
              Une seule chose à garder en tête : le cocktail se déroule dans
              le parc. Attention aux talons hauts !
            </p>
          </article>
          <article>
            <span>🎒</span>
            <h3>À ne pas oublier</h3>
            <p>
              Maillot de bain, serviette et tenue de sport pour celles et ceux
              qui le souhaitent.
            </p>
          </article>
        </div>
        <p className="practical-contact">
          Évidemment, n’hésitez pas à nous contacter pour toute question.
        </p>
      </section>

      <LodgingBooking />

      <footer>
        <span>Damien & Julie · 29 & 30 mai 2027</span>
        <a className="admin-link" href="/admin" aria-label="Accès administrateur">
          🔒 Admin
        </a>
      </footer>
    </main>
  );
}
