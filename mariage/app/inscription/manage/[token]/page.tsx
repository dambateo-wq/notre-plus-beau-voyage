import type { Metadata } from "next";
import Link from "next/link";
import RegistrationManager from "@/app/components/RegistrationManager";
import { getRegistrationByToken } from "@/lib/registration";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mon inscription | Damien & Julie",
  robots: { index: false, follow: false },
};

export default async function ManageRegistrationPage({ params }: PageProps<"/inscription/manage/[token]">) {
  const { token } = await params;
  let data = null;
  try {
    data = await getRegistrationByToken(token);
  } catch (caught) {
    console.error("registration.manage.page", caught);
  }

  if (!data) {
    return (
      <main className="registration-manage-page registration-invalid">
        <section>
          <p className="eyebrow">Lien personnel</p>
          <h1>Ce lien n’est plus accessible</h1>
          <p>Vérifiez que l’adresse a été copiée en entier ou contactez Damien et Julie.</p>
          <Link href="/">Retour au site</Link>
        </section>
      </main>
    );
  }

  return <RegistrationManager data={data} token={token} />;
}
