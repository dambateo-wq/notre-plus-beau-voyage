import { getSupabaseConfig } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { url, headers } = getSupabaseConfig();
    const response = await fetch(
      `${url}/rest/v1/guest_routes?select=*&order=created_at.asc`,
      {
        headers,
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error("Unable to load routes");
    }

    return Response.json(await response.json());
  } catch {
    return Response.json([], { status: 200 });
  }
}
