import "server-only";

type MonitorResult = { status: "sent" | "disabled" | "failed"; reason?: string };

// A success heartbeat is sent ONLY after the real Supabase SELECT succeeded.
// The independent monitor also detects missing invocations and authentication failures.
export async function reportKeepalive(success: boolean): Promise<MonitorResult> {
  const value = process.env.KEEPALIVE_HEALTHCHECK_URL;
  if (!value) return { status: "disabled" };

  let ping: URL;
  try {
    ping = new URL(value.trim());
    const path = ping.pathname.replace(/\/$/, "");
    if (ping.protocol !== "https:" || ping.hostname !== "hc-ping.com" || ping.port ||
        ping.username || ping.password || ping.search || ping.hash ||
        !/^\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(path)) {
      return { status: "failed", reason: "invalid_url" };
    }
    ping.pathname = `${path}${success ? "" : "/fail"}`;
  } catch {
    return { status: "failed", reason: "invalid_url" };
  }

  try {
    const response = await fetch(ping, {
      method: "GET", cache: "no-store", redirect: "error",
      signal: AbortSignal.timeout(3000),
    });
    await response.body?.cancel();
    return response.ok ? { status: "sent" } : { status: "failed", reason: "http_error" };
  } catch {
    // Never log the URL (it contains a secret), headers, or raw fetch errors.
    return { status: "failed", reason: "network_or_timeout" };
  }
}
