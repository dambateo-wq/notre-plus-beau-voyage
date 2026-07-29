import WeddingSurvey from "./components/WeddingSurvey";
import CarpoolBoard from "./components/CarpoolBoard";

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

        <article className="card">
          <span>📅</span>
          <h3>Le programme</h3>
          <p>Retrouvez bientôt tous les horaires du week-end.</p>
        </article>

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

      <CarpoolBoard />

      <WeddingSurvey />

      <footer>
        <span>Damien & Julie · 29 & 30 mai 2027</span>
        <a className="admin-link" href="/admin" aria-label="Accès administrateur">
          🔒 Admin
        </a>
      </footer>
    </main>
  );
}
