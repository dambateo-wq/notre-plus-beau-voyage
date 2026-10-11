import { getSupabaseConfig } from "@/lib/supabase";
import { reportKeepalive } from "@/lib/keepalive-monitor";
import { randomUUID, timingSafeEqual } from "node:crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 15;

export async function GET(request: Request) {
  const runId = randomUUID();
  const started = Date.now();
  const responseHeaders = {
    "Cache-Control": "private, no-store, max-age=0",
    "CDN-Cache-Control": "no-store",
    "Vercel-CDN-Cache-Control": "no-store",
    "X-Keepalive-Run-Id": runId,
  };
  const log = (event: string, details: Record<string, unknown> = {}, error = false) => {
    const record = JSON.stringify({ event, runId, at: new Date().toISOString(), ...details });
    if (error) console.error(record); else console.info(record);
  };
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  const expected = Buffer.from(`Bearer ${cronSecret ?? ""}`);
  const supplied = Buffer.from(authorization ?? "");

  if (!cronSecret || expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    // Do not send /fail for arbitrary callers: that would allow alert spam.
    log("supabase.keepalive.unauthorized", { reason: cronSecret ? "invalid_authorization" : "cron_secret_missing" }, true);
    return new Response("Unauthorized", { status: 401, headers: responseHeaders });
  }

  let upstreamStatus: number | undefined;
  let phase = "supabase_configuration";
  let failureReason = "configuration_error";
  try {
    const { url, headers } = getSupabaseConfig();
    const target = new URL("rest/v1/guest_routes", `${url.replace(/\/$/, "")}/`);
    target.searchParams.set("select", "id");
    target.searchParams.set("limit", "1");
    log("supabase.keepalive.started", { host: target.hostname, table: "guest_routes" });
    phase = "supabase_request";
    failureReason = "upstream_request_failed";
    const response = await fetch(
      target,
      {
        method: "GET",
        headers: { ...headers, "Cache-Control": "no-cache" },
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(8000),
      },
    );
    upstreamStatus = response.status;
    if (!response.ok) {
      failureReason = "upstream_http_error";
      await response.body?.cancel();
      throw new Error("upstream_http_error");
    }

    phase = "supabase_response";
    failureReason = "invalid_upstream_response";
    const rows: unknown = await response.json();
    if (!Array.isArray(rows) || rows.length > 1) throw new Error("invalid_upstream_response");
    const upstreamRequestId = response.headers.get("sb-request-id") ?? response.headers.get("x-request-id");
    log("supabase.keepalive.succeeded", {
      upstreamStatus, durationMs: Date.now() - started,
      ...(upstreamRequestId && /^[a-z0-9-]{1,100}$/i.test(upstreamRequestId) ? { upstreamRequestId } : {}),
    });

  } catch (error) {
    const reason = error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)
      ? "upstream_timeout" : failureReason;
    log("supabase.keepalive.failed", { phase, reason, upstreamStatus, durationMs: Date.now() - started }, true);
    const monitor = await reportKeepalive(false);
    log("supabase.keepalive.monitor", monitor, monitor.status !== "sent");
    return Response.json({ ok: false }, { status: 500, headers: responseHeaders });
  }

  const monitor = await reportKeepalive(true);
  log("supabase.keepalive.monitor", monitor, monitor.status !== "sent");
  // A monitoring outage does not change the result of the actual database read.
  return Response.json({ ok: true }, { headers: responseHeaders });
}
