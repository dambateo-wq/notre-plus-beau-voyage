import { getSupabaseConfig } from "@/lib/supabase";
import { getPrivateSupabaseConfig } from "@/lib/admin-data";
import { addRouteTravelers } from "@/lib/guest-route-travelers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { url, headers } = getSupabaseConfig();
    const { headers: privateHeaders } = getPrivateSupabaseConfig();
    const [response, registrationsResponse] = await Promise.all([
      fetch(`${url}/rest/v1/guest_routes?select=*&order=created_at.asc`, {
        headers, cache: "no-store",
      }),
      fetch(`${url}/rest/v1/wedding_responses?select=respondent_name,companions,departure_city,departure_country,not_attending&order=created_at.asc`, {
        headers: privateHeaders, cache: "no-store",
      }),
    ]);

    if (!response.ok || !registrationsResponse.ok) {
      throw new Error("Unable to load routes");
    }

    const [routes, registrations] = await Promise.all([
      response.json(), registrationsResponse.json(),
    ]);
    if (!Array.isArray(routes) || !Array.isArray(registrations)) {
      throw new Error("Invalid route data");
    }
    return Response.json(addRouteTravelers(routes, registrations), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "La carte collective est momentanément indisponible." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
