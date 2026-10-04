import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';

const password = 'local-photos-test';
const guest = 'https://photos.app.goo.gl/guestTest';
async function login(base, html, value) {
  const action = html.match(/name="(\$ACTION_ID_[^"]+)"/);
  assert(action, 'server action form available');
  const body = new FormData(); body.set(action[1], ''); body.set('password', value);
  return fetch(base + '/photos', { method: 'POST', body, redirect: 'manual', headers: { Origin: base } });
}
for (const mode of ['configured', 'missing', 'disabled']) {
  const port = mode === 'configured' ? 3201 : mode === 'missing' ? 3202 : 3203;
  const base = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
    env: { ...process.env, WEDDING_PHOTOS_PASSWORD: mode === 'disabled' ? '' : password,
      WEDDING_GUEST_GOOGLE_PHOTOS_URL: mode === 'configured' ? guest : '',
      WEDDING_OFFICIAL_GOOGLE_PHOTOS_URL: mode === 'configured' ? 'https://photos.app.goo.gl/officialTest' : '' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('server start timeout')), 15000);
      server.stdout.on('data', data => { if (data.toString().includes('Ready')) { clearTimeout(timeout); resolve(); } });
      server.on('error', reject);
    });
    const html = await (await fetch(base + '/photos')).text();
    assert(!html.includes(password) && !html.includes(guest));
    assert.equal((await fetch(base + '/photos/qr')).status, 401);
    if (mode === 'disabled') { assert(html.includes('bientôt accessible')); console.log('PASS disabled: safe unavailable page and QR denied'); continue; }
    const wrong = await login(base, html, 'wrong');
    assert.equal(wrong.status, 303);
    assert(wrong.headers.get('location').includes('error=password'));
    assert(!wrong.headers.get('set-cookie'));
    const right = await login(base, html, password);
    assert.equal(right.status, 303);
    const cookieHeader = right.headers.get('set-cookie');
    assert(cookieHeader.includes('HttpOnly') && cookieHeader.includes('Secure') && cookieHeader.includes('SameSite=strict') && cookieHeader.includes('Path=/photos'));
    const headers = { Cookie: cookieHeader.split(';')[0] };
    const albumHtml = await (await fetch(base + '/photos', { headers })).text();
    assert(albumHtml.includes('de notre photographe') && albumHtml.includes('du week-end'));
    assert(!albumHtml.includes('name="password"'));
    assert((await (await fetch(base + '/photos', { headers })).text()).includes('Fermer ma session Photos'));
    const qr = await fetch(base + '/photos/qr?download', { headers });
    if (mode === 'configured') {
      assert(albumHtml.includes(guest) && albumHtml.includes('officialTest'));
      assert.equal(qr.status, 200);
      assert(qr.headers.get('content-disposition').startsWith('attachment'));
      assert.equal(qr.headers.get('cache-control'), 'private, no-store');
      const png = PNG.sync.read(Buffer.from(await qr.arrayBuffer()));
      assert.equal(png.width, 1600);
      assert.equal(jsQR(new Uint8ClampedArray(png.data), png.width, png.height).data, guest);
    } else {
      assert(albumHtml.includes('disponible après le mariage') && albumHtml.includes('bientôt disponible'));
      assert.equal(qr.status, 404);
    }
    const tampered = headers.Cookie.slice(0, -1) + (headers.Cookie.endsWith('a') ? 'b' : 'a');
    assert.equal((await fetch(base + '/photos/qr', { headers: { Cookie: tampered } })).status, 401);
    const logoutAction = albumHtml.match(/name="(\$ACTION_ID_[^"]+)"/);
    const logoutBody = new FormData(); logoutBody.set(logoutAction[1], '');
    const logout = await fetch(base + '/photos', { method: 'POST', body: logoutBody, redirect: 'manual', headers: { ...headers, Origin: base } });
    assert.equal(logout.status, 303);
    assert(logout.headers.get('set-cookie').includes('Max-Age=0'));
    const home = await (await fetch(base)).text();
    const nav = home.match(/class="v2-nav-links"([\s\S]*?)<details/)[1];
    assert(nav.lastIndexOf('Photos') > nav.indexOf('Préparer le départ'));
    assert(home.includes('v2-mobile-photos-link') && home.includes('id="photos"'));
    assert(home.indexOf('id="photos"') > home.indexOf('id="voyage-de-noces"'));
    console.log(`PASS ${mode}: server auth, session, navigation, album states, QR access/PNG/decode`);
  } finally { server.kill('SIGTERM'); }
}
