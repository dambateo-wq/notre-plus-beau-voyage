import type { Metadata } from "next";
import {
  getCarpoolOffers,
  getCarpoolRequests,
  getWeddingResponses,
} from "@/lib/admin-data";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { login, logout } from "./actions";
import DeleteResponseButton from "./DeleteResponseButton";
import DeleteCarpoolButton from "./DeleteCarpoolButton";
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

  const [responses, carpoolOffers, carpoolRequests] = await Promise.all([
    getWeddingResponses(),
    getCarpoolOffers(),
    getCarpoolRequests(),
  ]);
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
          <div className={styles.headingActions}>
            <a className={styles.exportButton} href="/admin/export">
              Télécharger en Excel
            </a>
            <form action={logout}>
              <button className={styles.logoutButton} type="submit">
                Se déconnecter
              </button>
            </form>
          </div>
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
                  <div className={styles.responseActions}>
                    <span
                      className={`${styles.status} ${
                        response.not_attending ? styles.declined : ""
                      }`}
                    >
                      {response.not_attending
                        ? "Ne sera pas présent"
                        : "Présent"}
                    </span>
                    <DeleteResponseButton
                      id={response.id}
                      name={response.respondent_name}
                    />
                  </div>
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

        <section className={styles.carpoolAdmin}>
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>Covoiturage</p>
              <h2>Les trajets proposés</h2>
            </div>
            <span>
              {carpoolOffers.length} offre{carpoolOffers.length > 1 ? "s" : ""} ·{" "}
              {carpoolRequests.length} demande
              {carpoolRequests.length > 1 ? "s" : ""}
            </span>
          </div>

          {carpoolOffers.length === 0 ? (
            <p className={styles.empty}>
              Aucun trajet n’a encore été proposé.
            </p>
          ) : (
            <div className={styles.responses}>
              {carpoolOffers.map((offer) => (
                <article className={styles.responseCard} key={offer.id}>
                  <div className={styles.responseTop}>
                    <div>
                      <h2>{offer.driver_name}</h2>
                      <time dateTime={offer.departure_at}>
                        Départ le{" "}
                        {new Intl.DateTimeFormat("fr-FR", {
                          dateStyle: "long",
                          timeStyle: "short",
                          timeZone: "Europe/Paris",
                        }).format(new Date(offer.departure_at))}
                      </time>
                    </div>
                    <div className={styles.responseActions}>
                      <span className={styles.status}>
                        {offer.seats_available} place
                        {offer.seats_available > 1 ? "s" : ""}
                      </span>
                      <DeleteCarpoolButton
                        id={offer.id}
                        name={offer.driver_name}
                      />
                    </div>
                  </div>
                  <dl className={styles.details}>
                    <div>
                      <dt>Trajet</dt>
                      <dd>
                        {offer.direction === "to_massacan"
                          ? `${offer.other_place} → Domaine de Massacan`
                          : `Domaine de Massacan → ${offer.other_place}`}
                      </dd>
                    </div>
                    <div>
                      <dt>Contact</dt>
                      <dd>{offer.contact}</dd>
                    </div>
                    <div>
                      <dt>Précisions</dt>
                      <dd>{offer.details || "—"}</dd>
                    </div>
                  </dl>
                  {carpoolRequests.some(
                    (request) => request.offer_id === offer.id,
                  ) && (
                    <div className={styles.rideRequests}>
                      <h3>Demandes de place</h3>
                      {carpoolRequests
                        .filter((request) => request.offer_id === offer.id)
                        .map((request) => (
                          <div className={styles.rideRequest} key={request.id}>
                            <p>
                              <strong>{request.passenger_name}</strong> ·{" "}
                              {request.seats_requested} place
                              {request.seats_requested > 1 ? "s" : ""}
                            </p>
                            <p>{request.passenger_contact}</p>
                            {request.message && <p>{request.message}</p>}
                          </div>
                        ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
