import { DigestServiceError, runWeeklyDigest, secretMatches } from "@/lib/weekly-digest/server";
import { latestDigestWindow, withinScheduledWindow } from "@/lib/weekly-digest/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store", "CDN-Cache-Control": "no-store" };

export async function POST(request: Request) {
  if (!secretMatches(request.headers.get("authorization"), process.env.WEEKLY_DIGEST_CRON_SECRET)) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  }
  if (process.env.WEEKLY_DIGEST_ENABLED !== "true" || process.env.VERCEL_ENV === "preview") {
    return Response.json({ status: "disabled" }, { headers });
  }
  const now = new Date();
  const window = latestDigestWindow(now);
  if (!withinScheduledWindow(now, window)) return Response.json({ status: "not_due" }, { headers });
  try {
    const result = await runWeeklyDigest(window, "scheduled");
    if (result.status === "uncertain") {
      return Response.json({ ...result, error: "smtp_outcome_uncertain" }, {
        status: 489, headers: { ...headers, "Upstash-NonRetryable-Error": "true" },
      });
    }
    if (["busy", "ready", "blocked"].includes(result.status)) {
      return Response.json(result, { status: 503, headers: { ...headers, "Retry-After": "60" } });
    }
    return Response.json(result, { headers });
  } catch (error) {
    const code = error instanceof DigestServiceError ? error.code : "digest_failed";
    console.error(JSON.stringify({ event: "wedding.digest.cron_failed", periodEnd: window.end, code }));
    return Response.json({ error: code }, { status: 503, headers: { ...headers, "Retry-After": "60" } });
  }
}
