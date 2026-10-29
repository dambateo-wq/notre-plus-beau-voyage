import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import RegistrationManager from "@/app/components/RegistrationManager";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { adminRegistrationData, isReservationId, readAdminReservation } from "@/lib/admin-reservation-edit";
import StandaloneReservationEditor from "../../StandaloneReservationEditor";
import styles from "../../admin.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Modifier une réservation | Administration", robots: { index: false, follow: false } };
const money = (cents: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);

export default async function EditReservationPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) redirect("/admin");
  const { id } = await params;
  if (!isReservationId(id)) notFound();
  const snapshot = await readAdminReservation(id);
  if (!snapshot) notFound();
  const reservation = snapshot.reservation;
  const linked = adminRegistrationData(snapshot);
  const adminReservation = { id, reservationUpdatedAt: reservation.updated_at, registrationUpdatedAt: snapshot.registration?.updated_at ?? null };
  return <main className={styles.page}><div className={styles.shell}>
    <p><Link href="/admin">← Retour à l’administration</Link></p>
    <h1>Modifier la réservation {reservation.reference}</h1>
    <p>Tarif : 35 € par personne et par nuit. Les encaissements déjà enregistrés sont conservés.</p>
    <p>Montant actuel : {money(reservation.amount_cents)} · Encaissé : {reservation.received_amount_cents == null ? "à vérifier" : money(reservation.received_amount_cents)}.</p>
    <p>Les placements des voyageurs inchangés sont conservés pour les nuits déjà attribuées. Les nouveaux voyageurs, les noms modifiés et les nuits ajoutées sont à vérifier dans le plan de chambres.</p>
    <p><Link href="/admin/bilan-hebdomadaire">Mettre à jour les montants réellement encaissés</Link></p>
    {reservation.financial_review_status === "pending" ? <p role="alert">Traitez d’abord la modification financière en attente sur la page d’administration, puis revenez ici.</p>
      : linked ? <RegistrationManager data={linked} adminReservation={adminReservation} />
      : <StandaloneReservationEditor reservation={reservation} version={adminReservation} />}
  </div></main>;
}
