import { getSupabaseConfig } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const { url, headers } = getSupabaseConfig();
    const response = await fetch(
      `${url}/rest/v1/guest_routes?select=id&limit=1`,
      {
        headers,
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error(`Supabase responded with status ${response.status}`);
    }

    await response.json();

    return Response.json({ ok: true });
  } catch (error) {
    console.error("supabase.keepalive", error);
    return Response.json({ ok: false }, { status: 500 });
  }
}
