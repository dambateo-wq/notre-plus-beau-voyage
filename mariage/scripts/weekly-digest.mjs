// No Gmail/Supabase credentials are needed by this CLI. Do not place secrets in URLs.
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const origin = process.env.WEDDING_SITE_URL || 'https://les-dadjus-notre-plus-beau-voyage.vercel.app';
const parsed = new URL(origin);
const loopback = ['127.0.0.1', 'localhost'].includes(parsed.hostname);
if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/'
  || !(parsed.origin === 'https://les-dadjus-notre-plus-beau-voyage.vercel.app' || loopback && process.env.NODE_ENV !== 'production')) {
  throw new Error('Use the verified wedding origin or a local development server.');
}
const [command, value] = process.argv.slice(2);
const cron = '0-12 16-17 * * 0';
const destination = `${parsed.origin}/api/cron/weekly-digest`;

if (command === 'schedule-plan' || !command) {
  console.log(JSON.stringify({ cron, schedulerTimeZone: 'UTC', localTime: 'Sunday 18:00 Europe/Paris',
    calendarGuard: 'wedding_digest_scheduler.due_period', destination, provider: 'Supabase Cron (existing wedding project)',
    email: 'existing Gmail / sendWeddingEmail', maxHttpAttempts: 4, retryWindowMinutes: 10,
    setup: 'Apply weekly_digest_supabase_cron inactive, provision Vault, verify, then activate the named job.', applied: false }, null, 2));
} else if (command === 'schedule-apply') {
  throw new Error('The scheduler is managed in the existing Supabase project. Follow WEEKLY_DIGEST_ACTIVATION.md; this command makes no remote changes.');
} else if (command === 'preview' || command === 'test') {
  const secret = process.env.WEEKLY_DIGEST_TEST_SECRET;
  if (!secret || secret.length < 32) throw new Error('WEEKLY_DIGEST_TEST_SECRET is required.');
  const endpoint = new URL('/api/admin/weekly-digest', parsed.origin);
  const end = process.env.WEEKLY_DIGEST_PERIOD_END;
  if (command === 'preview' && end) endpoint.searchParams.set('end', end);
  const response = await fetch(endpoint, {
    method: command === 'test' ? 'POST' : 'GET', redirect: 'error',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json',
      ...(command === 'preview' ? { Accept: 'application/json' } : {}) },
    ...(command === 'test' ? { body: JSON.stringify({ testKey: value, end }) } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`Digest request failed (${response.status}): ${result.error || result.status || 'unknown'}`);
  if (command === 'preview') {
    const output = resolve(value || '/tmp/wedding-weekly-digest-preview.html');
    await writeFile(output, result.html, { mode: 0o600 });
    console.log(JSON.stringify({ preview: output, subject: result.subject, sent: false, warnings: result.digest.warnings }));
  } else console.log(JSON.stringify(result));
} else throw new Error('Commands: schedule-plan, preview [path], test <stable-test-key>');
