import { getPrivateSupabaseConfig } from "@/lib/admin-data";
import { sendCarpoolRecoveryEmail } from "@/lib/carpool-email";

function cleanEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase().slice(0, 120) : "";
}

export async function POST(request: Request) {
  const body = (await request.json()) as { email?: unknown };
  const email = cleanEmail(body.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "Indiquez une adresse e-mail valide." }, { status: 400 });
  }

  try {
    const { url, headers } = getPrivateSupabaseConfig();
    const response = await fetch(
      `${url}/rest/v1/carpool_offers?driver_email=eq.${encodeURIComponent(email)}&select=driver_name,direction,other_place,management_token&order=created_at.desc`,
      { headers, cache: "no-store" },
    );
    const offers = response.ok ? await response.json() : [];
    if (offers.length) {
      const origin = new URL(request.url).origin;
      await sendCarpoolRecoveryEmail(
        email,
        offers.map((offer: Record<string, string>) => ({
          driverName: offer.driver_name,
          journey: offer.direction === "to_massacan"
            ? `${offer.other_place} → Domaine de Massacan`
            : `Domaine de Massacan → ${offer.other_place}`,
          manageUrl: `${origin}/carpool/manage/${offer.management_token}`,
        })),
      );
    }
  } catch (caught) {
    console.error("carpool.recover", caught);
  }

  return Response.json({
    success: true,
    message: "Si une annonce correspond à cette adresse, son lien privé vient d’être envoyé.",
  });
}
