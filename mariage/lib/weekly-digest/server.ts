import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { getPrivateSupabaseConfig } from "@/lib/admin-data";
import { isEmailConfigured, sendWeddingEmail } from "@/lib/email";
import { LODGING_NIGHTS, LODGING_PRICE_CENTS } from "@/lib/lodging";
import { assertDigestSendable, buildWeeklyDigest, DigestDataError, type DigestSnapshot } from "./model";
import { DIGEST_RECIPIENT_KEYS, renderWeeklyDigest } from "./render";
import type { DigestWindow } from "./time";

export function secretMatches(supplied: string | null, expected: string | undefined) {
  if (!expected || expected.length < 32 || !supplied) return false;
  const a = Buffer.from(supplied), b = Buffer.from(`Bearer ${expected}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export class DigestServiceError extends Error {
  constructor(public readonly code: string) { super(code); }
}

export function getDigestRecipients() {
  const damien = process.env.WEEKLY_DIGEST_DAMIEN_EMAIL?.trim().toLowerCase();
  const julie = process.env.WEEKLY_DIGEST_JULIE_EMAIL?.trim().toLowerCase();
  if (!damien || !julie || damien === julie || ![damien, julie].every(email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    throw new DigestServiceError("digest_recipients_not_configured");
  }
  return { damien, julie };
}

async function rpc<T>(name: string, values: Record<string, unknown> = {}): Promise<T> {
  const { url, headers } = getPrivateSupabaseConfig();
  let response: Response;
  try {
    response = await fetch(`${url}/rest/v1/rpc/${name}`, {
      method: "POST", headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(values), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000),
    });
  } catch { throw new DigestServiceError("supabase_unreachable"); }
  if (!response.ok) {
    await response.body?.cancel();
    throw new DigestServiceError("supabase_read_or_journal_failed");
  }
  try { return await response.json() as T; }
  catch { throw new DigestServiceError("invalid_supabase_response"); }
}

export function readDigestSnapshot() {
  return rpc<DigestSnapshot>("weekly_digest_snapshot");
}

export async function previewWeeklyDigest(window: DigestWindow, test = false) {
  const snapshot = await readDigestSnapshot();
  const digest = buildWeeklyDigest(snapshot, window, LODGING_PRICE_CENTS, LODGING_NIGHTS);
  return { digest, ...renderWeeklyDigest(digest, test) };
}

type StoredRun = {
  key: string; lease_token: string; subject: string | null; html_body: string | null; text_body: string | null;
};
type Claim = { acquired: boolean; reason?: string; run?: StoredRun };
type JournalResult = { acquired?: boolean; reason?: string; run?: StoredRun; send?: boolean; status?: string; ok?: boolean };
function journal(action: string, key: string, token: string | null = null, data: Record<string, unknown> = {}) {
  return rpc<JournalResult>("weekly_digest_journal", { p_action: action, p_key: key, p_token: token, p_data: data });
}

function errorCode(error: unknown) {
  return error instanceof DigestDataError || error instanceof DigestServiceError ? error.code : "digest_execution_failed";
}

export function definiteSmtpRejection(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error
    && ["EAUTH", "EENVELOPE"].includes(String(error.code)));
}

async function deliver(message: Parameters<typeof sendWeddingEmail>[0]) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      sendWeddingEmail(message),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new DigestServiceError("smtp_timeout_uncertain")), 15000); }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}

export async function runWeeklyDigest(window: DigestWindow, mode: "scheduled" | "test", testKey = "") {
  if (mode === "test" && !/^[a-zA-Z0-9_-]{8,80}$/.test(testKey)) throw new DigestServiceError("invalid_test_key");
  const suffix = mode === "test" ? `:${createHash("sha256").update(testKey).digest("hex")}` : "";
  const key = `${mode}:${window.end}${suffix}`;
  const started = Date.now();
  const claim = await journal("claim", key, null, { ...window, mode }) as Claim;
  if (!claim.acquired) return { key, status: claim.reason ?? "busy", sent: 0 };
  if (!claim.run?.lease_token) throw new DigestServiceError("invalid_journal_claim");
  let run = claim.run;
  let sent = 0;
  try {
    if (!isEmailConfigured()) throw new DigestServiceError("gmail_not_configured");
    const recipients = getDigestRecipients();
    if (!run.html_body) {
      const preview = await previewWeeklyDigest(window, mode === "test");
      assertDigestSendable(preview.digest);
      const prepared = await journal("prepare", key, run.lease_token, { subject: preview.subject, html: preview.html, text: preview.text });
      if (!prepared.run) throw new DigestServiceError("invalid_journal_prepare");
      run = prepared.run;
    }
    if (!run.subject || !run.html_body || !run.text_body) throw new DigestServiceError("empty_digest");

    for (const recipientKey of DIGEST_RECIPIENT_KEYS) {
      const recipient = recipients[recipientKey];
      // Leave enough time to persist the outcome; pending recipients can resume safely.
      if (Date.now() - started > 35000) throw new DigestServiceError("execution_budget_exhausted");
      const attempt = await journal("begin_delivery", key, run.lease_token, { recipient: recipientKey });
      if (!attempt.send) continue;
      let outcome: "sent" | "failed" | "uncertain";
      let failure: string | undefined;
      try {
        const result = await deliver({ to: recipient, subject: run.subject, html: run.html_body, text: run.text_body });
        outcome = result.sent ? "sent" : "failed";
        if (!result.sent) failure = "gmail_not_configured";
      } catch (error) {
        outcome = definiteSmtpRejection(error) ? "failed" : "uncertain";
        failure = outcome === "failed" ? "smtp_rejected_before_delivery" : "smtp_outcome_uncertain";
      }
      // If this write fails after Gmail accepted the message, the persisted 'sending'
      // marker becomes 'uncertain' on recovery. It is never treated as pending.
      await journal("finish_delivery", key, run.lease_token, { recipient: recipientKey, status: outcome, error: failure });
      if (outcome === "sent") sent++;
      if (outcome === "uncertain") break;
      if (outcome === "failed") throw new DigestServiceError(failure!);
    }
    const final = await journal("release", key, run.lease_token);
    console.info(JSON.stringify({ event: "wedding.digest.completed", key, status: final.status, sent }));
    return { key, status: final.status ?? "ready", sent };
  } catch (error) {
    const code = errorCode(error);
    try { await journal("release", key, run.lease_token, { error: code }); } catch { /* Preserve the pre-send marker if the journal is unavailable. */ }
    console.error(JSON.stringify({ event: "wedding.digest.failed", key, code }));
    throw new DigestServiceError(code);
  }
}
