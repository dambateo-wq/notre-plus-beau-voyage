import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import RegistrationManager from "@/app/components/RegistrationManager";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { isReservationId } from "@/lib/admin-reservation-edit";
import { adminRegistrationForm, readAdminRegistration } from "@/lib/admin-registration-edit";
import styles from "../../admin.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Modifier une inscription | Administration", robots: { index: false, follow: false } };

export default async function EditRegistrationPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) redirect("/admin");
  const { id } = await params;
  if (!isReservationId(id)) notFound();
  const snapshot = await readAdminRegistration(id);
  if (!snapshot) notFound();
  if (snapshot.reservationId) redirect(`/admin/reservations/${snapshot.reservationId}`);
  return <main className={styles.page}><div className={styles.shell}>
    <p><Link href="/admin">← Retour à l’administration</Link></p>
    <h1>Modifier l’inscription de {snapshot.registration.respondent_name}</h1>
    <p>Vous pouvez modifier les participants, leur présence et leurs réponses, même sans hébergement au domaine.</p>
    <p>Si vous ajoutez un hébergement, le tarif est de 35 € par personne et par nuit. Aucun paiement n’est considéré comme reçu automatiquement.</p>
    <RegistrationManager data={adminRegistrationForm(snapshot)} adminRegistration={{ id, registrationUpdatedAt: snapshot.registration.updated_at }} />
  </div></main>;
}
