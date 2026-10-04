// Run against two local production servers: configured albums and missing albums.
// Never points to production and never opens or writes to a Google album.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PHOTOS_TEST_CHROMIUM, args: ['--no-sandbox'] });
  try {
    for (const missing of [false, true]) {
      const base = `http://127.0.0.1:${missing ? 3102 : 3101}`;
      const context = await browser.newContext();
      const page = await context.newPage();
      const response = await page.goto(`${base}/photos`);
      const html = await response.text();
      assert(!html.includes('local-photos-test'));
      assert(!html.includes('guestTest'));
      assert.equal((await context.request.get(`${base}/photos/qr`)).status(), 401);
      await page.locator('input[name=password]').fill('wrong');
      await page.getByRole('button', { name: 'Entrer dans l’album' }).click();
      await page.getByRole('alert').waitFor();
      assert.equal((await context.cookies()).filter(c => c.name === 'wedding_photos_session').length, 0);
      await page.locator('input[name=password]').fill('local-photos-test');
      await page.getByRole('button', { name: 'Entrer dans l’album' }).click();
      await page.getByRole('heading', { name: 'Les photos des mariés' }).waitFor();
      await page.reload();
      assert.equal(await page.locator('input[name=password]').count(), 0);
      const cookie = (await context.cookies()).find(c => c.name === 'wedding_photos_session');
      assert(cookie.httpOnly && cookie.secure && cookie.sameSite === 'Strict' && cookie.path === '/photos');
      if (missing) {
        assert(await page.getByText('L’album sera disponible après le mariage.').isVisible());
        assert(await page.getByText('L’album du week-end sera bientôt disponible.').isVisible());
        assert.equal((await context.request.get(`${base}/photos/qr`)).status(), 404);
      } else {
        assert.equal(await page.getByRole('link', { name: /Découvrir l’album/ }).getAttribute('href'), 'https://photos.app.goo.gl/officialTest');
        assert.equal(await page.getByRole('link', { name: /Ajouter mes photos/ }).getAttribute('href'), 'https://photos.app.goo.gl/guestTest');
        const qr = await context.request.get(`${base}/photos/qr?download`);
        assert.equal(qr.status(), 200);
        assert(qr.headers()['content-disposition'].startsWith('attachment'));
        assert.equal(qr.headers()['cache-control'], 'private, no-store');
        const png = PNG.sync.read(await qr.body());
        assert.equal(png.width, 1600);
        assert.equal(jsQR(new Uint8ClampedArray(png.data), png.width, png.height).data, 'https://photos.app.goo.gl/guestTest');
      }
      for (const width of [375, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate(() => document.fonts.ready);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}`);
        const images = await page.locator('article img').evaluateAll(images => images.map(i => i.complete && i.naturalWidth > 0));
        assert(images.every(Boolean));
        if (!missing && [390, 1440].includes(width)) await page.screenshot({ path: `/tmp/photos-${width}.png`, fullPage: true });
      }
      await page.getByRole('button', { name: 'Fermer ma session Photos' }).click();
      await page.locator('input[name=password]').waitFor();
      assert.equal((await context.request.get(`${base}/photos/qr`)).status(), 401);
      await page.goto(base);
      const order = await page.locator('.v2-nav-links').innerText();
      assert(order.lastIndexOf('Photos') > order.indexOf('Préparer le départ'));
      assert(await page.locator('#photos a[href="/photos"]').count());
      assert(await page.locator('.v2-mobile-nav a[href="#photos"]').count());
      assert(await page.evaluate(() => Boolean(document.querySelector('.honeymoon-section')?.compareDocumentPosition(document.querySelector('#photos')) & Node.DOCUMENT_POSITION_FOLLOWING)));
      await context.close();
    }
    console.log('Photos: password, session, URL states, navigation, mobile/desktop, PNG and decoded QR passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
