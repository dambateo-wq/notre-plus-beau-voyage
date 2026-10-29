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
const cron = 'CRON_TZ=Europe/Paris 0 18 * * 0';
const destination = `${parsed.origin}/api/cron/weekly-digest`;

if (command === 'schedule-plan' || !command) {
  console.log(JSON.stringify({ cron, destination, provider: 'QStash (scheduler only)', email: 'existing Gmail / sendWeddingEmail', retries: 3, retryDelayMs: 60000, applied: false }, null, 2));
} else if (command === 'schedule-apply') {
  if (value !== '--approved') throw new Error('Explicit deployment/scheduler approval is required: schedule-apply --approved');
  if (loopback) throw new Error('Schedules cannot target a local server.');
  if (process.env.WEEKLY_DIGEST_ENABLED !== 'true') throw new Error('Approve and enable the production deployment before scheduling.');
  const token = process.env.QSTASH_TOKEN;
  const secret = process.env.WEEKLY_DIGEST_CRON_SECRET;
  if (!token || !secret || secret.length < 32) throw new Error('Missing scheduler credentials.');
  const response = await fetch(`https://qstash.upstash.io/v2/schedules/${destination}`, {
    method: 'POST', redirect: 'error',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
      'Upstash-Cron': cron, 'Upstash-Schedule-Id': 'notre-plus-beau-voyage-weekly-digest',
      'Upstash-Forward-Authorization': `Bearer ${secret}`,
      'Upstash-Retries': '3', 'Upstash-Retry-Delay': '60000', 'Upstash-Timeout': '55s' },
    body: '{}',
  });
  if (!response.ok) throw new Error(`Scheduler configuration failed (${response.status}); no secrets logged.`);
  const result = await response.json();
  console.log(JSON.stringify({ applied: true, scheduleId: result.scheduleId, cron, destination }));
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
} else throw new Error('Commands: schedule-plan, schedule-apply --approved, preview [path], test <stable-test-key>');
