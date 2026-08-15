import type { Metadata } from "next";
import Link from "next/link";
import {
  getCarpoolOffers,
  getCarpoolRequests,
  getWeddingResponses,
} from "@/lib/admin-data";
import { getAdminNotifications, getLodgingAssignments, getLodgingChangeRequests, getLodgingGuestAssignments, getLodgingReservations, legacyGuestAssignments } from "@/lib/lodging";
import {
  getAttendingEmailRecipients,
  getLastGuestCampaign,
  getPaymentReminderCandidates,
  getWeddingEmailHistory,
  isValidWeddingEmail,
} from "@/lib/admin-email";
import { formatCarpoolDate, legacyUtcClockToLocal } from "@/lib/carpool-time";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { login, logout } from "./actions";
import DeleteResponseButton from "./DeleteResponseButton";
import DeleteCarpoolButton from "./DeleteCarpoolButton";
import LodgingActions from "./LodgingActions";
import LodgingFloorPlans from "./LodgingFloorPlans";
import LodgingGuestPlanner from "./LodgingGuestPlanner";
import LodgingPlacementAction from "./LodgingPlacementAction";
import LodgingChangeReview from "./LodgingChangeReview";
import GuestMessageManager from "./GuestMessageManager";
import PaymentReminderAction from "./PaymentReminderAction";
import PaymentReminderManager from "./PaymentReminderManager";
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

  const [responses, carpoolOffers, carpoolRequests, lodgingReservations, lodgingAssignments, storedGuestAssignments, lodgingChanges, notifications, emailHistory] = await Promise.all([
    getWeddingResponses(),
    getCarpoolOffers(),
    getCarpoolRequests(),
    getLodgingReservations(),
    getLodgingAssignments(),
    getLodgingGuestAssignments(),
    getLodgingChangeRequests(),
    getAdminNotifications(),
    getWeddingEmailHistory(),
  ]);
  const lodgingGuestAssignments = storedGuestAssignments.length
    ? storedGuestAssignments
    : legacyGuestAssignments(lodgingReservations, lodgingAssignments);
  const lodgingReservationsById = new Map(
    lodgingReservations.map((reservation) => [reservation.id, reservation]),
  );
  const lodgingReservationsByResponseId = new Map(
    lodgingReservations
      .filter((reservation) => reservation.wedding_response_id)
      .map((reservation) => [reservation.wedding_response_id as string, reservation]),
  );
  const linkedLodgingReservationIds = new Set(
    responses
      .map((response) =>
        response.lodging_reservation_id
          ? lodgingReservationsById.get(response.lodging_reservation_id)?.id
          : lodgingReservationsByResponseId.get(response.id)?.id,
      )
      .filter((id): id is string => Boolean(id)),
  );
  const standaloneLodgingReservations = lodgingReservations.filter(
    (reservation) => !linkedLodgingReservationIds.has(reservation.id),
  );
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
  const reminderCandidates = getPaymentReminderCandidates(
    lodgingReservations,
    responses,
    emailHistory.entries,
  );
  const reminderCandidatesByReservationId = new Map(
    reminderCandidates.map((candidate) => [candidate.reservationId, candidate]),
  );
  const paidLodgingReservations = lodgingReservations.filter(
    (reservation) =>
      reservation.booking_status === "active" &&
      reservation.amount_cents > 0 &&
      reservation.payment_status === "confirmed",
  );
  const pendingAmountCents = reminderCandidates.reduce(
    (sum, candidate) => sum + candidate.amountCents,
    0,
  );
  const attendingEmailRecipients = getAttendingEmailRecipients(responses);
  const attendingRegistrationsWithEmail = responses.filter(
    (response) =>
      !response.not_attending &&
      response.attendance_days.length > 0 &&
      isValidWeddingEmail(response.respondent_email),
  ).length;
  const lastGuestCampaign = getLastGuestCampaign(emailHistory.entries);

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.heading}>
          <div>
            <p className={styles.eyebrow}>Tableau de bord privé</p>
            <h1>Les réponses du voyage</h1>
          </div>
          <div className={styles.headingActions}>
            <Link className={styles.backButton} href="/">
              ← Retour au site
            </Link>
            <a className={styles.exportButton} href="/admin/export">
              Télécharger en Excel
            </a>
            <a className={styles.exportButton} href="/api/admin/lodging-plan">
              Plan d’hébergement Excel
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

        {notifications.some((notification) => !notification.read_at) && (
          <section className={styles.notifications} aria-labelledby="notifications-title">
            <div>
              <p className={styles.eyebrow}>À traiter</p>
              <h2 id="notifications-title">Notifications</h2>
            </div>
            {notifications.filter((notification) => !notification.read_at).map((notification) => (
              <article key={notification.id}>
                <strong>{notification.message}</strong>
                <time dateTime={notification.created_at}>{new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(notification.created_at))}</time>
              </article>
            ))}
          </section>
        )}

        <div className={styles.emailToolsGrid}>
          <PaymentReminderManager
            paidCount={paidLodgingReservations.length}
            pendingCount={reminderCandidates.length}
            pendingAmountCents={pendingAmountCents}
            candidates={reminderCandidates}
            historyAvailable={emailHistory.available}
          />
          <GuestMessageManager
            registrationsCount={attendingRegistrationsWithEmail}
            recipients={attendingEmailRecipients}
            lastCampaign={lastGuestCampaign}
            historyAvailable={emailHistory.available}
          />
        </div>

        <section className={styles.responses}>
          {responses.length === 0 ? (
            <p className={styles.empty}>
              Aucune réponse n’a encore été enregistrée.
            </p>
          ) : (
            responses.map((response) => {
              const reservation = response.lodging_reservation_id
                ? lodgingReservationsById.get(response.lodging_reservation_id)
                : lodgingReservationsByResponseId.get(response.id);
              const placed = reservation
                ? lodgingGuestAssignments.filter(
                    (assignment) => assignment.reservation_id === reservation.id,
                  ).length
                : 0;
              const placementStatus = reservation?.placement_status ??
                (placed > 0 ? "in_progress" : "pending");
              const placementLabel = placementStatus === "finalized"
                ? "Placement finalisé"
                : placementStatus === "in_progress"
                  ? "Placement en cours"
                  : "À placer";
              const pendingChange = reservation
                ? lodgingChanges.find(
                    (change) =>
                      change.reservation_id === reservation.id &&
                      change.status === "pending",
                  )
                : undefined;

              return (
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
                    {reservation && (
                      <>
                        <span className={pendingChange ? styles.status + " " + styles.reviewStatus : reservation.booking_status === "cancelled" ? styles.status + " " + styles.declined : reservation.payment_status === "confirmed" ? styles.status : styles.status + " " + styles.pendingStatus}>
                          {pendingChange
                            ? "Modification à valider"
                            : reservation.booking_status === "cancelled"
                              ? "Nuitées annulées"
                              : reservation.payment_status === "confirmed"
                                ? "Paiement confirmé"
                                : reservation.payment_status === "declared"
                                  ? "Paiement à vérifier"
                                  : "Paiement à venir"}
                        </span>
                        <LodgingActions
                          bookingStatus={reservation.booking_status}
                          id={reservation.id}
                          paymentStatus={reservation.payment_status}
                        />
                        {reminderCandidatesByReservationId.has(reservation.id) && (
                          <PaymentReminderAction
                            candidate={reminderCandidatesByReservationId.get(reservation.id)!}
                            historyAvailable={emailHistory.available}
                          />
                        )}
                        {reservation.booking_status === "active" && reservation.payment_status === "confirmed" && !pendingChange && (
                          <div className={styles.placementActionWrap}>
                            <span className={`${styles.placementBadge} ${
                              placementStatus === "finalized"
                                ? styles.placementFinalized
                                : placementStatus === "in_progress"
                                  ? styles.placementInProgress
                                  : styles.placementPending
                            }`}>
                              {placementLabel} · {placed}/{reservation.guests_count}
                            </span>
                            {placementStatus === "finalized" ? (
                              <LodgingPlacementAction reservationId={reservation.id} />
                            ) : (
                              <a className={styles.placementStatusLink} href="#guest-planner-title">
                                {placed > 0 ? "Compléter le placement" : "Placer les voyageurs"}
                              </a>
                            )}
                          </div>
                        )}
                      </>
                    )}
                    <DeleteResponseButton
                      id={response.id}
                      name={response.respondent_name}
                    />
                  </div>
                </div>

                {pendingChange && <LodgingChangeReview change={pendingChange} />}

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
                      <dt>Contact</dt>
                      <dd>{response.respondent_email}{response.phone ? ` · ${response.phone}` : ""}</dd>
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
                    {reservation && (
                      <div>
                        <dt>Réservation du domaine</dt>
                        <dd>
                          {reservation.reference} · {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(reservation.amount_cents / 100)}
                          <br />
                          {joinOrDash(reservation.guest_names)}
                        </dd>
                      </div>
                    )}
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
              );
            })
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
                      <time dateTime={offer.departure_local ?? offer.departure_at}>
                        Départ le{" "}
                        {formatCarpoolDate(
                          offer.departure_local ?? legacyUtcClockToLocal(offer.departure_at),
                          true,
                        )}
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

        <section className={styles.carpoolAdmin}>
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>Hébergement</p>
              <h2>Placement au domaine</h2>
            </div>
            <span>
              {lodgingReservations.filter((reservation) => reservation.booking_status === "active").length} réservation
              {lodgingReservations.filter((reservation) => reservation.booking_status === "active").length > 1 ? "s" : ""}
            </span>
          </div>

          <LodgingGuestPlanner
            reservations={lodgingReservations}
            initialAssignments={lodgingGuestAssignments}
          />

          <LodgingFloorPlans
            assignments={lodgingGuestAssignments}
            reservations={lodgingReservations}
          />

          {standaloneLodgingReservations.length > 0 && (
            <>
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.eyebrow}>Historique</p>
                <h2>Réservations indépendantes</h2>
              </div>
            </div>
            <div className={styles.responses}>
              {standaloneLodgingReservations.map((reservation) => {
                const placed = lodgingGuestAssignments.filter(
                  (assignment) => assignment.reservation_id === reservation.id,
                ).length;
                const placementStatus = reservation.placement_status ??
                  (placed > 0 ? "in_progress" : "pending");
                const placementLabel = placementStatus === "finalized"
                  ? "Placement finalisé"
                  : placementStatus === "in_progress"
                    ? "Placement en cours"
                    : "À placer";
                const pendingChange = lodgingChanges.find(
                  (change) => change.reservation_id === reservation.id && change.status === "pending",
                );

                return (
                <article className={styles.responseCard} key={reservation.id}>
                  <div className={styles.responseTop}>
                    <div>
                      <h2>{reservation.booker_name}</h2>
                      <time dateTime={reservation.created_at}>
                        Référence {reservation.reference} · créée le{" "}
                        {new Intl.DateTimeFormat("fr-FR", {
                          dateStyle: "long",
                          timeStyle: "short",
                          timeZone: "Europe/Paris",
                        }).format(new Date(reservation.created_at))}
                      </time>
                    </div>
                    <div className={styles.responseActions}>
                      <span className={pendingChange ? styles.status + " " + styles.reviewStatus : reservation.booking_status === "cancelled" ? styles.status + " " + styles.declined : reservation.payment_status === "confirmed" ? styles.status : styles.status + " " + styles.pendingStatus}>
                        {pendingChange
                          ? "Modification à valider"
                          : reservation.booking_status === "cancelled"
                          ? "Annulée"
                          : reservation.payment_status === "confirmed"
                            ? "Paiement confirmé"
                            : reservation.payment_status === "declared"
                              ? "Paiement à vérifier"
                              : "Paiement à venir"}
                      </span>
                      <LodgingActions
                        bookingStatus={reservation.booking_status}
                        id={reservation.id}
                        paymentStatus={reservation.payment_status}
                      />
                      {reminderCandidatesByReservationId.has(reservation.id) && (
                        <PaymentReminderAction
                          candidate={reminderCandidatesByReservationId.get(reservation.id)!}
                          historyAvailable={emailHistory.available}
                        />
                      )}
                      {reservation.booking_status === "active" && reservation.payment_status === "confirmed" && !pendingChange && (
                        <div className={styles.placementActionWrap}>
                          <span className={`${styles.placementBadge} ${
                            placementStatus === "finalized"
                              ? styles.placementFinalized
                              : placementStatus === "in_progress"
                                ? styles.placementInProgress
                                : styles.placementPending
                          }`}>
                            {placementLabel} · {placed}/{reservation.guests_count}
                          </span>
                          {placementStatus === "finalized" ? (
                            <LodgingPlacementAction reservationId={reservation.id} />
                          ) : (
                            <a className={styles.placementStatusLink} href="#guest-planner-title">
                              {placed > 0 ? "Compléter le placement" : "Placer les voyageurs"}
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  {pendingChange && <LodgingChangeReview change={pendingChange} />}
                  <dl className={styles.details}>
                    <div>
                      <dt>Nuitées</dt>
                      <dd>{joinOrDash(reservation.nights.map((night) => dayLabels[night] ?? night))}</dd>
                    </div>
                    <div>
                      <dt>Personnes</dt>
                      <dd>{reservation.guest_names.join(", ")}</dd>
                    </div>
                    <div>
                      <dt>Montant</dt>
                      <dd>{new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(reservation.amount_cents / 100)}</dd>
                    </div>
                    <div>
                      <dt>Contact</dt>
                      <dd>{reservation.phone}{reservation.email ? " · " + reservation.email : ""}</dd>
                    </div>
                    <div>
                      <dt>Règlement choisi</dt>
                      <dd>{reservation.payment_method === "wero" ? "Wero" : reservation.payment_method === "bank_transfer" ? "Virement" : "Plus tard"}</dd>
                    </div>
                    <div>
                      <dt>Souhait de chambre</dt>
                      <dd>{reservation.roommate_wishes || "—"}</dd>
                    </div>
                  </dl>
                </article>
                );
              })}
            </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
