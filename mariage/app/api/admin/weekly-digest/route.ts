import { isAdminAuthenticated } from "@/lib/admin-auth";
import { DigestServiceError, previewWeeklyDigest, runWeeklyDigest, secretMatches } from "@/lib/weekly-digest/server";
import { latestDigestWindow, windowEndingAt } from "@/lib/weekly-digest/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = {
  "Cache-Control": "private, no-store", "CDN-Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer",
};

async function access(request: Request) {
  const token = secretMatches(request.headers.get("authorization"), process.env.WEEKLY_DIGEST_TEST_SECRET);
  return token || await isAdminAuthenticated();
}

export async function GET(request: Request) {
  if (!(await access(request))) return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  try {
    const url = new URL(request.url);
    const end = url.searchParams.get("end");
    const window = end ? windowEndingAt(end) : latestDigestWindow();
    const preview = await previewWeeklyDigest(window, true);
    if (url.searchParams.get("format") === "html") return new Response(preview.html, {
      headers: { ...headers, "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'" },
    });
    return Response.json(preview, { headers });
  } catch {
    return Response.json({ error: "Le bilan ne peut pas être généré. Vérifiez la migration et les données dans l’administration." }, { status: 503, headers });
  }
}

export async function POST(request: Request) {
  if (!(await access(request))) return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  const token = secretMatches(request.headers.get("authorization"), process.env.WEEKLY_DIGEST_TEST_SECRET);
  if (!token && request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "Forbidden" }, { status: 403, headers });
  if (process.env.WEEKLY_DIGEST_TEST_ENABLED !== "true") return Response.json({ error: "test_sending_disabled" }, { status: 409, headers });
  try {
    const body = await request.json();
    const window = body.end ? windowEndingAt(String(body.end)) : latestDigestWindow();
    const result = await runWeeklyDigest(window, "test", String(body.testKey ?? ""));
    return Response.json(result, { status: result.status === "sent" ? 200 : 409, headers });
  } catch (error) {
    return Response.json({ error: error instanceof DigestServiceError ? error.code : "test_failed" }, { status: 503, headers });
  }
}
