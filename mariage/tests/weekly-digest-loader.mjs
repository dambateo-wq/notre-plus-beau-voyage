import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const require = createRequire(import.meta.url);
export async function moduleUrl(path, replacements = []) {
  let source = (await readFile(path, 'utf8')).replace('import "server-only";', '');
  for (const [from, to] of replacements) source = source.replaceAll(from, JSON.stringify(to));
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return 'data:text/javascript;base64,' + Buffer.from(outputText).toString('base64');
}
export const dataModule = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');

export async function loadDigestModules(emailOverride) {
  const time = await moduleUrl('lib/weekly-digest/time.ts');
  const model = await moduleUrl('lib/weekly-digest/model.ts');
  const attendance = await moduleUrl('lib/attendance.ts');
  const email = await moduleUrl('lib/email.ts', [['"nodemailer"', pathToFileURL(require.resolve('nodemailer')).href]]);
  const render = await moduleUrl('lib/weekly-digest/render.ts', [['"@/lib/email"', email], ['"@/lib/attendance"', attendance], ['"./time"', time]]);
  const config = dataModule(`export function getPrivateSupabaseConfig(){ return {url:'https://database.example',headers:{apikey:'test-service-key',Authorization:'Bearer test-service-key'}}; }`);
  const lodging = await moduleUrl('lib/lodging.ts', [['"@/lib/admin-data"', config]]);
  const server = await moduleUrl('lib/weekly-digest/server.ts', [
    ['"@/lib/admin-data"', config], ['"@/lib/email"', emailOverride || email], ['"@/lib/lodging"', lodging],
    ['"./model"', model], ['"./render"', render],
  ]);
  const cron = await moduleUrl('app/api/cron/weekly-digest/route.ts', [['"@/lib/weekly-digest/server"', server], ['"@/lib/weekly-digest/time"', time]]);
  const auth = dataModule('export async function isAdminAuthenticated(){return Boolean(globalThis.__weeklyDigestAdmin);}');
  const manual = await moduleUrl('app/api/admin/weekly-digest/route.ts', [
    ['"@/lib/admin-auth"', auth], ['"@/lib/weekly-digest/server"', server], ['"@/lib/weekly-digest/time"', time],
  ]);
  return { time: await import(time), model: await import(model), render: await import(render), server: await import(server), cron: await import(cron), manual: await import(manual) };
}

export function fixture() {
  const registration = {
    id: '11111111-1111-4111-8111-111111111111', respondent_name: 'Alex & Morgan', companions: ['Camille', 'Camille'],
    attendance_days: ['2027-05-28', '2027-05-29-morning', '2027-05-29-afternoon', '2027-05-30'], not_attending: false,
    created_at: '2026-10-22T10:00:00.000Z', updated_at: '2026-10-25T17:00:00Z',
    lodging_guest_names: ['Alex & Morgan', 'Camille', 'Camille'], lodging_nights: ['2027-05-28', '2027-05-29'],
    roommate_wishes: '<script>unsafe</script>', lodging_reservation_id: '22222222-2222-4222-8222-222222222222',
  };
  const reservation = {
    id: registration.lodging_reservation_id, reference: 'NPBV-TEST', booker_name: registration.respondent_name,
    guest_names: [...registration.lodging_guest_names], guests_count: 3, nights: [...registration.lodging_nights],
    amount_cents: 21000, received_amount_cents: 7000, payment_method: 'wero', payment_status: 'unpaid', booking_status: 'active',
    roommate_wishes: registration.roommate_wishes, wedding_response_id: registration.id, financial_review_status: 'none', proposed_amount_cents: null,
  };
  return {
    captured_at: '2026-10-25T17:00:01Z', registrations: [registration], reservations: [reservation],
    assignments: [{ reservation_id: reservation.id, guest_index: 1, guest_name: registration.respondent_name, room_name: 'A1', assigned_nights: ['2027-05-28'] }],
    legacy_assignments: [],
  };
}
