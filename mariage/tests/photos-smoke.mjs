// Production-mode browser checks with local test albums only; never contact Google Photos.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

const password = 'local-photos-test';
const guest = 'https://photos.app.goo.gl/guestTest';
const official = 'https://photos.app.goo.gl/officialTest';
const output = process.env.PHOTOS_TEST_OUTPUT_DIR || '/tmp/photos-redesign';
const pngBeforeRedesign = 'e10d89bac5952ff4a9ec24628f6a36d5f7f1f91a1dc6aeba24247cea57c35332';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true, executablePath: process.env.PHOTOS_TEST_CHROMIUM,
  args: ['--no-sandbox', '--disable-dev-shm-usage', ...JSON.parse(process.env.PHOTOS_TEST_CHROMIUM_ARGS || '[]')],
});
try {
  for (const [index, mode] of ['draft', 'published', 'missing'].entries()) {
    const base = 'http://127.0.0.1:' + (3391 + index);
    const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(3391 + index)], {
      env: { ...process.env, WEDDING_PHOTOS_PASSWORD: password,
        WEDDING_OFFICIAL_GOOGLE_PHOTOS_URL: mode === 'missing' ? '' : official,
        WEDDING_GUEST_GOOGLE_PHOTOS_URL: mode === 'missing' ? '' : guest,
        WEDDING_OFFICIAL_GOOGLE_PHOTOS_PUBLISHED: mode === 'published' ? 'true' : '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const context = await browser.newContext();
    await context.route('https://photos.app.goo.gl/**', route => route.fulfill({ contentType: 'text/html', body: '<p>Album de test</p>' }));
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Next.js startup timeout')), 15000);
        server.stdout.on('data', chunk => { if (String(chunk).includes('Ready')) { clearTimeout(timer); resolve(); } });
        server.once('error', error => { clearTimeout(timer); reject(error); });
        server.once('exit', code => { clearTimeout(timer); reject(new Error('Next.js exited: ' + code)); });
        server.stderr.resume();
      });
      const response = await page.goto(base + '/photos');
      const html = await response.text();
      assert(!html.includes(password) && !html.includes(guest));
      assert.equal((await context.request.get(base + '/photos/qr')).status(), 401);
      await page.locator('input[name=password]').fill('wrong');
      await page.getByRole('button', { name: 'Entrer dans l’album' }).click();
      await page.getByRole('alert').waitFor();
      await page.waitForURL(base + '/photos?error=password');
      assert.equal((await context.cookies()).filter(cookie => cookie.name === 'wedding_photos_session').length, 0);
      // Wait for a settled form after the failed Server Action before typing again.
      await page.reload();
      await page.locator('input[name=password]').fill(password);
      assert.equal(await page.locator('input[name=password]').inputValue(), password);
      await page.getByRole('button', { name: 'Entrer dans l’album' }).click();
      await page.getByRole('heading', { name: 'Les photos de notre photographe' }).waitFor();
      await page.reload();
      assert.equal(await page.locator('input[name=password]').count(), 0);
      const cookie = (await context.cookies()).find(cookie => cookie.name === 'wedding_photos_session');
      assert(cookie.httpOnly && cookie.secure && cookie.sameSite === 'Strict' && cookie.path === '/photos');
      if (mode === 'published') {
        assert.equal(await page.getByRole('link', { name: /Découvrir l’album/ }).getAttribute('href'), official);
        assert.equal(await page.getByText('Album à venir', { exact: true }).count(), 0);
        assert.equal(await page.getByText('À venir…', { exact: true }).count(), 0);
      } else {
        assert(await page.getByText('Album à venir', { exact: true }).isVisible());
        assert.equal(await page.getByRole('link', { name: /Découvrir l’album/ }).count(), 0);
      }
      if (mode === 'missing') {
        assert(await page.getByText('L’album du week-end sera bientôt disponible.').isVisible());
        // APIRequestContext does not apply Chromium's secure-loopback exception.
        assert.equal((await context.request.get(base + '/photos/qr', { headers: { Cookie: cookie.name + '=' + cookie.value } })).status(), 404);
      } else {
        for (const name of [/Ajouter mes photos/i, /Voir les photos sur Google Photos/i]) {
          const link = page.getByRole('link', { name });
          assert.equal(await link.getAttribute('href'), guest);
          assert.equal(await link.getAttribute('target'), '_blank');
          assert((await link.getAttribute('rel')).includes('noopener'));
          const popupPromise = page.waitForEvent('popup');
          await link.click();
          const popup = await popupPromise;
          await popup.waitForURL(guest, { waitUntil: 'domcontentloaded' });
          assert.equal(popup.url(), guest);
          await popup.close();
        }
        const downloadPromise = page.waitForEvent('download');
        await page.getByRole('link', { name: /Télécharger le QR code/ }).click();
        const download = await downloadPromise;
        assert.equal(download.suggestedFilename(), 'photos-du-week-end-qr.png');
        assert.equal(await download.failure(), null);
        const downloadedPng = await readFile(await download.path());
        assert.equal(createHash('sha256').update(downloadedPng).digest('hex'), pngBeforeRedesign);
        assert.equal(await page.locator('img[src="/photos/qr"]').getAttribute('width'), '176');
        assert.equal(await page.locator('img[src="/photos/qr"]').getAttribute('height'), '176');
      }
      for (const width of [360, 390, 430, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate(() => document.fonts.ready);
        await page.locator('article').last().scrollIntoViewIfNeeded();
        await page.waitForFunction(() => [...document.querySelectorAll('article img')].every(image => image.complete && image.naturalWidth > 0));
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), mode + ': overflow at ' + width);
        const cards = page.locator('article[aria-labelledby]');
        assert.equal(await cards.count(), 2);
        const imageBoxes = [];
        for (const article of await cards.all()) {
          const card = await article.boundingBox();
          const illustration = await article.locator('img').first().boundingBox();
          imageBoxes.push(illustration);
          const title = await article.getByRole('heading', { level: 2 }).boundingBox();
          assert(title.x >= card.x && title.x + title.width <= card.x + card.width + 1, 'title stays in card');
          if (width < 760) assert(title.y >= illustration.y + illustration.height, 'mobile illustration precedes text');
          else assert(title.x >= illustration.x + illustration.width, 'desktop illustration is left of text');
          const polaroids = article.locator('div[aria-hidden="true"] > div');
          assert.equal(await polaroids.count(), 3);
          for (const polaroid of await polaroids.all()) {
            const box = await polaroid.boundingBox();
            assert(box.x >= card.x && box.x + box.width <= card.x + card.width, 'Polaroids are not clipped');
            assert(box.y >= card.y && box.y + box.height <= card.y + card.height, 'Polaroids stay in card');
          }
          for (const link of await article.locator('a').all()) {
            const box = await link.boundingBox();
            assert(box.height >= 44, 'touch target is at least 44px');
          }
        }
        assert(Math.abs(imageBoxes[0].width - imageBoxes[1].width) < 1);
        assert(Math.abs(imageBoxes[0].height - imageBoxes[1].height) < 1);
        if (mode === 'draft') {
          await page.screenshot({ path: join(output, 'photos-' + width + '.png'), fullPage: true });
          if (width === 390 || width === 1440) {
            await cards.first().screenshot({ path: join(output, 'official-' + width + '.png') });
            await cards.last().screenshot({ path: join(output, 'guest-' + width + '.png') });
          }
        }
      }
      assert.deepEqual(pageErrors, [], 'no client-side errors');
      await page.getByRole('button', { name: 'Fermer ma session Photos' }).click();
      await page.locator('input[name=password]').waitFor();
      assert.equal((await context.request.get(base + '/photos/qr')).status(), 401);
      console.log('PASS ' + mode + ': session, albums, links, PNG identity, Polaroids and 360/390/430/768/1024/1440px');
    } catch (error) {
      console.error({ mode, url: page.url(), text: await page.locator('main').innerText(), cookies: (await context.cookies()).map(({ name, domain, secure, path }) => ({ name, domain, secure, path })) });
      await page.screenshot({ path: join(output, 'failure-' + mode + '.png'), fullPage: true });
      throw error;
    } finally {
      await context.close();
      if (server.pid && server.exitCode === null && server.signalCode === null) {
        const exit = once(server, 'exit'); server.kill('SIGTERM'); await exit;
      }
    }
  }
} finally { await browser.close(); }
