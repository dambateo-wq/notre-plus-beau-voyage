import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getDigestRecipients, readDigestSnapshot } from "@/lib/weekly-digest/server";
import { latestDigestWindow, frenchDate } from "@/lib/weekly-digest/time";
import { nightLabel } from "@/lib/weekly-digest/render";
import { saveAssignmentNights, saveVerifiedReceipt, sendDigestTest } from "./actions";
import styles from "../admin.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bilan hebdomadaire | Administration", robots: { index: false, follow: false } };

export default async function WeeklyDigestPage({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  if (!(await isAdminAuthenticated())) redirect("/admin");
  const window = latestDigestWindow();
  const result = (await searchParams).result;
  const snapshot = await readDigestSnapshot().catch(() => null);
  const active = snapshot?.reservations.filter(r => r.booking_status === "active") ?? [];
  let recipientLabel = "à configurer dans les variables serveur";
  try { recipientLabel = Object.values(getDigestRecipients()).join(" et "); } catch { /* Never invent recipient addresses. */ }
  return <main className={styles.page}><div className={styles.shell}>
    <p><Link href="/admin">← Retour à l’administration</Link></p>
    <h1>Bilan hebdomadaire</h1>
    <p>Chaque dimanche à 18 h, heure de Paris. Période terminée : {frenchDate(window.start)} → {frenchDate(window.end)}.</p>
    <p>Destinataires fixes : {recipientLabel}. Le Gmail existant assure l’envoi.</p>
    {result && <p role="status">Résultat : {result.replaceAll("_", " ")}</p>}
    {!snapshot ? <p role="alert">Le bilan est indisponible. Vérifiez la migration approuvée et l’accès Supabase. Aucun zéro de remplacement et aucun e-mail ne sont générés.</p> : <>
      <p><a href="/api/admin/weekly-digest?format=html" target="_blank" rel="noopener noreferrer">Ouvrir l’aperçu HTML sans envoyer d’e-mail</a></p>
      <iframe title="Aperçu privé du bilan, sans envoi" src="/api/admin/weekly-digest?format=html" sandbox="allow-same-origin" style={{ width: "100%", height: 760, border: "1px solid #ddd", background: "white" }} />
      <h2>Envoyer un test aux deux destinataires</h2>
      <p>La même référence de test ne peut pas être envoyée deux fois. Changez-la uniquement pour créer un nouveau test volontaire.</p>
      <form action={sendDigestTest}>
        <label>Référence du test <input name="testKey" required pattern="[a-zA-Z0-9_-]{8,80}" defaultValue={`test-${window.end.slice(0, 10)}`} /></label>{" "}
        <button type="submit" disabled={process.env.WEEKLY_DIGEST_TEST_ENABLED !== "true"}>Envoyer l’e-mail de test aux deux adresses</button>
      </form>
      <h2>Vérifier les montants réellement encaissés</h2>
      <p>Les anciennes réservations sans montant vérifié bloquent l’envoi automatique. Saisir 0 signifie que vous avez vérifié l’absence d’encaissement. Le choix Wero ou virement ne vaut pas réception.</p>
      {active.map(r => <section key={r.id} style={{ margin: "18px 0", padding: 16, border: "1px solid #ddd" }}>
        <h3>{r.booker_name} · {r.reference}</h3>
        <p>Réservation : {(r.amount_cents / 100).toFixed(2)} €. Encaissé : {r.received_amount_cents === null ? "non vérifié" : `${(r.received_amount_cents / 100).toFixed(2)} €`}.</p>
        <form action={saveVerifiedReceipt}>
          <input type="hidden" name="reservationId" value={r.id} />
          <label>Montant total encaissé vérifié, en euros <input name="amount" inputMode="decimal" required defaultValue={r.received_amount_cents === null ? "" : (r.received_amount_cents / 100).toFixed(2)} /></label>{" "}
          <button type="submit">Enregistrer l’encaissement vérifié</button>
        </form>
      </section>)}
      <h2>Nuits couvertes par les affectations individuelles</h2>
      <p>Le placement habituel attribue toutes les nuits réservées. Vous pouvez ici limiter une affectation à une seule nuit. Pour retirer une personne ou changer sa chambre, utilisez le plan de chambres habituel. Les contrôles de capacité du plan restent conservateurs.</p>
      {snapshot.assignments.map(a => {
        const reservation = active.find(r => r.id === a.reservation_id);
        if (!reservation) return null;
        return <form key={`${a.reservation_id}:${a.guest_index}`} action={saveAssignmentNights} style={{ margin: "16px 0" }}>
          <strong>{a.guest_name} · {a.room_name}</strong>{" "}
          <input type="hidden" name="reservationId" value={a.reservation_id} />
          <input type="hidden" name="guestIndex" value={a.guest_index} />
          {reservation.nights.map(n => <label key={n} style={{ marginRight: 12 }}><input type="checkbox" name="nights" value={n} defaultChecked={(a.assigned_nights ?? reservation.nights).includes(n)} /> {nightLabel(n)}</label>)}
          <button type="submit" disabled={reservation.financial_review_status === "pending"}>Enregistrer les nuits couvertes</button>
        </form>;
      })}
    </>}
  </div></main>;
}
