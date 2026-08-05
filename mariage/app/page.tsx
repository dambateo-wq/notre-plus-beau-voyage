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

        <article className="card">
          <span>🧭</span>
          <h3>Comment venir</h3>
          <p>Adresse, transports et informations pratiques.</p>
        </article>

        <a className="card" href="#covoiturage">
          <span>🚗</span>
          <h3>Covoiturage</h3>
          <p>Proposez ou recherchez un trajet avec les autres invités.</p>
        </a>

        <a className="card registration-card" href="#sondage">
          <span>🚲</span>
          <h3>Inscription au voyage</h3>
          <p>Confirmez votre présence et vos souhaits pour le week-end.</p>
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

      <CarpoolBoard />
      <LodgingBooking />

      <WeddingSurvey />
      <RsvpReminder />

      <footer>
        <span>Damien & Julie · 29 & 30 mai 2027</span>
        <a className="admin-link" href="/admin" aria-label="Accès administrateur">
          🔒 Admin
        </a>
      </footer>
    </main>
  );
}
