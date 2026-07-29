import type { Metadata } from "next";
import { getWeddingResponses } from "@/lib/admin-data";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { login, logout } from "./actions";
import styles from "./admin.module.css";

export const metadata: Metadata = {
  title: "Réponses du mariage | Damien & Julie",
  robots: { index: false, follow: false },
};

const dayLabels: Record<string, string> = {
  "2027-05-28": "Vendredi 28 mai",
  "2027-05-29": "Samedi 29 mai",
  "2027-05-30": "Dimanche 30 mai",
};

function joinOrDash(items: string[]) {
  return items.length ? items.join(", ") : "—";
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const authenticated = await isAdminAuthenticated();

  if (!authenticated) {
    const { error } = await searchParams;

    return (
      <main className={styles.page}>
        <div className={styles.loginShell}>
          <section className={styles.loginCard}>
            <p className={styles.eyebrow}>Espace privé</p>
            <h1>Les réponses du voyage</h1>
            <p className={styles.intro}>
              Cet espace est réservé à Damien et Julie. Entrez votre mot de
              passe pour consulter les réponses au questionnaire.
            </p>
            <form action={login} className={styles.loginForm}>
              <label htmlFor="admin-password">Mot de passe</label>
              <input
                id="admin-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
              <button className={styles.primaryButton} type="submit">
                Consulter les réponses
              </button>
            </form>
            {error && (
              <p className={styles.error}>Le mot de passe est incorrect.</p>
            )}
          </section>
        </div>
      </main>
    );
  }

  const responses = await getWeddingResponses();
  const attending = responses.filter((response) => !response.not_attending);
  const declined = responses.length - attending.length;
  const totalGuests = attending.reduce(
    (sum, response) => sum + 1 + response.companions.length,
    0,
  );
  const lodgingNights = attending.reduce(
    (sum, response) =>
      sum + response.friday_sleepers + response.saturday_sleepers,
    0,
  );

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.heading}>
          <div>
            <p className={styles.eyebrow}>Tableau de bord privé</p>
            <h1>Les réponses du voyage</h1>
          </div>
          <form action={logout}>
            <button className={styles.logoutButton} type="submit">
              Se déconnecter
            </button>
          </form>
        </header>

        <section className={styles.stats} aria-label="Résumé des réponses">
          <div className={styles.stat}>
            <strong>{responses.length}</strong>
            <span>réponses reçues</span>
          </div>
          <div className={styles.stat}>
            <strong>{totalGuests}</strong>
            <span>invités présents</span>
          </div>
          <div className={styles.stat}>
            <strong>{declined}</strong>
            <span>réponses négatives</span>
          </div>
          <div className={styles.stat}>
            <strong>{lodgingNights}</strong>
            <span>nuitées réservées</span>
          </div>
        </section>

        <section className={styles.responses}>
          {responses.length === 0 ? (
            <p className={styles.empty}>
              Aucune réponse n’a encore été enregistrée.
            </p>
          ) : (
            responses.map((response) => (
              <article className={styles.responseCard} key={response.id}>
                <div className={styles.responseTop}>
                  <div>
                    <h2>{response.respondent_name}</h2>
                    <time dateTime={response.created_at}>
                      Réponse du{" "}
                      {new Intl.DateTimeFormat("fr-FR", {
                        dateStyle: "long",
                        timeStyle: "short",
                        timeZone: "Europe/Paris",
                      }).format(new Date(response.created_at))}
                    </time>
                  </div>
                  <span
                    className={`${styles.status} ${
                      response.not_attending ? styles.declined : ""
                    }`}
                  >
                    {response.not_attending ? "Ne sera pas présent" : "Présent"}
                  </span>
                </div>

                {!response.not_attending && (
                  <dl className={styles.details}>
                    <div>
                      <dt>Accompagnants</dt>
                      <dd>{joinOrDash(response.companions)}</dd>
                    </div>
                    <div>
                      <dt>Jours de présence</dt>
                      <dd>
                        {joinOrDash(
                          response.attendance_days.map(
                            (day) => dayLabels[day] ?? day,
                          ),
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Lieu de départ</dt>
                      <dd>
                        {response.departure_city && response.departure_country
                          ? `${response.departure_city}, ${response.departure_country}`
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt>Hébergement</dt>
                      <dd>
                        Vendredi : {response.friday_sleepers} personne
                        {response.friday_sleepers > 1 ? "s" : ""}
                        <br />
                        Samedi : {response.saturday_sleepers} personne
                        {response.saturday_sleepers > 1 ? "s" : ""}
                      </dd>
                    </div>
                    <div>
                      <dt>Souhait de chambre</dt>
                      <dd>{response.roommate_wishes || "—"}</dd>
                    </div>
                    <div>
                      <dt>Musiques souhaitées</dt>
                      <dd>{joinOrDash(response.songs)}</dd>
                    </div>
                  </dl>
                )}
              </article>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
