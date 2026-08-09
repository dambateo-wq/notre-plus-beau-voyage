import type { Metadata } from "next";
import CarpoolManager from "@/app/components/CarpoolManager";

export const metadata: Metadata = {
  title: "Gérer mon covoiturage | Damien & Julie",
  robots: { index: false, follow: false },
};

export default async function CarpoolManagePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <CarpoolManager token={token} />;
}
