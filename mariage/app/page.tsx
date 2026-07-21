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
        <article className="card">
          <span>🌿</span>
          <h3>Le Domaine</h3>
          <p>Découvrez le lieu, son parc et les espaces du mariage.</p>
        </article>

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

        <article className="card">
          <span>🚗</span>
          <h3>Covoiturage</h3>
          <p>Proposez ou recherchez un trajet avec les autres invités.</p>
        </article>
      </section>

      <section className="survey">
        <p className="eyebrow">Votre réponse compte</p>
        <h2>Prêts à prendre la route avec nous ?</h2>
        <p>Le sondage des invités sera ajouté à la prochaine étape.</p>
        <button type="button">Répondre au sondage</button>
      </section>

      <footer>
        Damien & Julie · 29 & 30 mai 2027
      </footer>
    </main>
  );
}
