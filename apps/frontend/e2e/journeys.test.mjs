/**
 * Browser journeys (claude.md 11.15). Needs the backend and the frontend running:
 *   E2E_BASE_URL (default http://localhost:3000), E2E_CHROME (optional browser path).
 * Optional: E2E_DEAD_API_URL = a frontend instance whose API_URL points nowhere (error pages).
 * Run: npm run test:e2e -w @quran/frontend
 * Every test gets a fresh incognito context (empty localStorage).
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import puppeteer from 'puppeteer-core';

const BASE = (process.env.E2E_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const CANDIDATES = [
  process.env.E2E_CHROME,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

let browser;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fresh() {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1000, height: 900 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  return { ctx, page, errors };
}
const storage = (page, key) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), key);
const textOf = (page, sel) => page.$eval(sel, (el) => el.textContent ?? '');
const clickText = async (page, selector, text) => {
  const handles = await page.$$(selector);
  for (const h of handles) {
    if (((await h.evaluate((el) => el.textContent)) ?? '').includes(text)) return h.click();
  }
  throw new Error(`no ${selector} with text ${text}`);
};

before(async () => {
  const executablePath = CANDIDATES.find((p) => existsSync(p));
  assert.ok(executablePath, 'no Chrome/Edge found (set E2E_CHROME)');
  browser = await puppeteer.launch({ executablePath, headless: true });
});
after(async () => browser?.close());

describe('reading pages', () => {
  test('sura list filters, sura page renders all ayahs with the right basmala rules', async () => {
    const { ctx, page, errors } = await fresh();
    await page.goto(`${BASE}/surah`, { waitUntil: 'networkidle0' });
    assert.equal((await page.$$('main ul li')).length, 114);
    await page.type('input[type=search]', 'الاخلاص');
    await page.waitForFunction(() => document.querySelectorAll('main ul li').length === 1);
    await page.click('main ul li a');
    await page.waitForSelector('[data-ayah-id]');
    assert.match(page.url(), /\/surah\/112$/);
    assert.equal((await page.$$('[data-ayah-id]')).length, 4);
    assert.equal(await page.$$eval('main > article > p.quran-text', (p) => p.length), 1); // basmala header

    await page.goto(`${BASE}/surah/2`, { waitUntil: 'networkidle0' });
    assert.equal((await page.$$('[data-ayah-id]')).length, 286); // 3 API pages joined
    // At-Tawba: no basmala header; 97: not twice (its ayah 1 text already has it)
    await page.goto(`${BASE}/surah/9`, { waitUntil: 'networkidle0' });
    assert.equal(await page.$$eval('main > article > p.quran-text', (p) => p.length), 0);
    await page.goto(`${BASE}/surah/97`, { waitUntil: 'networkidle0' });
    assert.equal(await page.$$eval('main > article > p.quran-text', (p) => p.length), 0);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  test('invalid routes show the 404 page', async () => {
    const { ctx, page } = await fresh();
    for (const path of ['/surah/115', '/surah/0', '/surah/abc', '/surah/2.5', '/topics/999999', '/topics/1?page=x', '/nope']) {
      const res = await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle0' });
      assert.equal(res.status(), 404, path);
      assert.match(await textOf(page, 'main'), /الصفحة مش موجودة/, path);
    }
    assert.equal(await storage(page, 'quran_last_route'), null, '404 pages are never "last page"');
    await ctx.close();
  });

  test('topics tree and a topic page', async () => {
    const { ctx, page, errors } = await fresh();
    await page.goto(`${BASE}/topics`, { waitUntil: 'networkidle0' });
    const first = await page.$('main ul li a');
    assert.ok(first, 'at least one topic');
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), first.click()]);
    assert.match(page.url(), /\/topics\/\d+/);
    const body = await textOf(page, 'main');
    assert.ok(/آية/.test(body));
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  test('tafsir loads on demand; a failing tafsir request shows a retry', async () => {
    const { ctx, page } = await fresh();
    await page.goto(`${BASE}/surah/1`, { waitUntil: 'networkidle0' });
    await clickText(page, '#ayah-1 button', 'التفسير');
    await page.waitForFunction(() => /القرطبي/.test(document.querySelector('#ayah-1 section')?.textContent ?? ''));

    await page.setRequestInterception(true);
    page.on('request', (r) => (r.url().includes('/tafsirs') ? r.abort() : r.continue()));
    await clickText(page, '#ayah-2 button', 'التفسير');
    await page.waitForFunction(() => /إعادة المحاولة/.test(document.querySelector('#ayah-2 section')?.textContent ?? ''));
    await ctx.close();
  });
});

describe('settings (quran_settings)', () => {
  test('apply immediately, persist across reloads, exact shape', async () => {
    const { ctx, page } = await fresh();
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
    await page.goto(`${BASE}/surah/112`, { waitUntil: 'networkidle0' });
    // follows the device until a choice is made; nothing stored yet
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), true);
    assert.equal(await storage(page, 'quran_settings'), null);

    await page.click('button[aria-label="إعدادات القراءة"]');
    await page.$eval('input[type=range]', (el) => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(el, '30');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-ayah-id] .quran-text')).fontSize === '30px');
    // design: light/dark is a switch (on = dark); the device is dark, so one click -> light
    assert.equal(await page.$eval('[role=dialog] [role=switch]', (el) => el.getAttribute('aria-checked')), 'true');
    await page.click('[role=dialog] [role=switch]');
    await page.waitForFunction(() => !document.documentElement.classList.contains('dark'));
    await clickText(page, '[role=dialog] button', 'إملائي');
    await page.waitForFunction(() => document.querySelector('[data-ayah-id] .quran-text').textContent.startsWith('قل هو الله'));

    assert.deepEqual(await storage(page, 'quran_settings'), { fontSize: 30, theme: 'light', script: 'simple' });
    await page.reload({ waitUntil: 'networkidle0' });
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), false);
    assert.equal(await page.$eval('[data-ayah-id] .quran-text', (el) => getComputedStyle(el).fontSize), '30px');
    assert.ok((await textOf(page, '[data-ayah-id] .quran-text')).startsWith('قل هو الله'));

    // search results stay Uthmani (decision 4)
    await page.goto(`${BASE}/search?q=${encodeURIComponent('الله الصمد')}`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('article');
    // U+0671 (alef wasla) only exists in the Uthmani text
    assert.match(await textOf(page, 'article p.quran-text'), /ٱ/);
    await ctx.close();
  });
});

describe('bookmark (quran_bookmark) + last page (quran_last_route)', () => {
  test('the last visible ayah is saved; home offers to continue; the khatma is untouched', async () => {
    const { ctx, page } = await fresh();
    await page.goto(`${BASE}/surah/2`, { waitUntil: 'networkidle0' });
    await page.$eval('#ayah-60', (el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await sleep(1200);
    const b = await storage(page, 'quran_bookmark');
    assert.deepEqual(Object.keys(b).sort(), ['ayahId', 'ayahNumber', 'suraNumber', 'updatedAt']);
    assert.equal(b.suraNumber, 2);
    assert.ok(b.ayahId >= 60 && b.ayahId <= 75, `bookmark ${b.ayahId}`);
    assert.equal(await storage(page, 'quran_khatma'), null); // scrolling never touches the khatma

    const last = await storage(page, 'quran_last_route');
    assert.equal(last.path, '/surah/2');
    assert.deepEqual(Object.keys(last).sort(), ['path', 'scrollY', 'updatedAt']);

    // a new visit to "/" goes back to the last page (spec 4.8)
    const page2 = await ctx.newPage();
    await page2.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
    await page2.waitForFunction(() => location.pathname === '/surah/2');

    // the home card (reached by navigation, not a fresh visit) continues at the bookmark
    await page2.click('nav a[href="/"]');
    await page2.waitForSelector('[data-testid=continue-reading]');
    await page2.click('[data-testid=continue-reading]');
    await page2.waitForFunction((id) => location.hash === `#ayah-${id}`, {}, b.ayahId);
    await ctx.close();
  });
});

describe('khatma (quran_khatma)', () => {
  test('explicit "تمت القراءة" only, no double completion, day completes at its full target', async () => {
    const { ctx, page } = await fresh();
    await page.goto(`${BASE}/khatma`, { waitUntil: 'networkidle0' });
    await clickText(page, 'form button', '15 يوم'); // 6236/15 -> 416 per day
    await clickText(page, 'form button', 'ابدأ الختمة');
    await page.waitForSelector('[role=progressbar]');
    const k0 = await storage(page, 'quran_khatma');
    assert.deepEqual(Object.keys(k0).sort(), ['completedDates', 'dailyTargetAyahs', 'durationDays', 'lastAyahId', 'startDate']);
    assert.equal(k0.dailyTargetAyahs, 416);

    await page.goto(`${BASE}/surah/1`, { waitUntil: 'networkidle0' });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(800);
    assert.equal((await storage(page, 'quran_khatma')).lastAyahId, 0, 'scrolling must not count');

    await clickText(page, '#ayah-7 button', 'تمت القراءة');
    await page.waitForFunction(() => /مقروءة/.test(document.querySelector('#ayah-3').textContent));
    const k1 = await storage(page, 'quran_khatma');
    assert.equal(k1.lastAyahId, 7);
    assert.deepEqual(k1.completedDates, []); // 7 < 416: today not complete
    assert.equal((await page.$$('#ayah-3 button')).some(Boolean), true);
    const labels = await page.$$eval('#ayah-3 button', (b) => b.map((x) => x.textContent));
    assert.ok(!labels.includes('تمت القراءة'), 'read ayahs cannot be completed again');

    // reach the full daily target (ayah 416 = 3:123) -> today is completed
    await page.goto(`${BASE}/surah/3`, { waitUntil: 'networkidle0' });
    await clickText(page, '#ayah-416 button', 'تمت القراءة');
    await page.waitForFunction(() => /مقروءة/.test(document.querySelector('#ayah-416').textContent));
    const k2 = await storage(page, 'quran_khatma');
    assert.equal(k2.lastAyahId, 416);
    assert.equal(k2.completedDates.length, 1);

    await page.goto(`${BASE}/khatma`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('[data-testid=today-status]');
    assert.match(await textOf(page, '[data-testid=today-status]'), /خلصت ورد النهارده/);
    await ctx.close();
  });
});

describe('share as image', () => {
  for (const [sura, ayahId, label, canShare] of [
    [112, 6222, 'short ayah, navigator.share', true],
    [2, 289, 'longest ayah (2:282), download fallback', false],
  ]) {
    test(`renders a sharp, unclipped RTL PNG (${label})`, async () => {
      const { ctx, page, errors } = await fresh();
      // Headless Chrome cannot show a share sheet: stub it (or disable it to test the download).
      await page.evaluateOnNewDocument((enabled) => {
        navigator.canShare = () => enabled;
        navigator.share = async (data) => {
          const f = data.files[0];
          window.__shared = { name: f.name, type: f.type, size: f.size, title: data.title };
        };
      }, canShare);
      await page.goto(`${BASE}/surah/${sura}`, { waitUntil: 'networkidle0' });
      await clickText(page, `#ayah-${ayahId} button`, 'مشاركة كصورة');
      await page.waitForSelector('[role=dialog] img', { timeout: 20_000 });
      const r = await page.evaluate(async () => {
        const img = document.querySelector('[role=dialog] img');
        await img.decode();
        const card = document.querySelector('[data-share-card]');
        return {
          w: img.naturalWidth,
          h: img.naturalHeight,
          cardH: card.offsetHeight,
          overflow: card.scrollHeight > card.offsetHeight || card.scrollWidth > card.offsetWidth,
          dir: card.getAttribute('dir'),
          font: getComputedStyle(card.querySelector('p')).fontFamily,
        };
      });
      assert.equal(r.w, 2160);
      assert.equal(r.h, r.cardH * 2, 'whole card captured (no clipping)');
      assert.equal(r.overflow, false);
      assert.equal(r.dir, 'rtl');
      assert.match(r.font, /Amiri Quran/);

      const dl = mkdtempSync(join(tmpdir(), 'share-'));
      const cdp = await page.createCDPSession();
      await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl, browserContextId: ctx.id });
      await clickText(page, '[role=dialog] button', 'مشاركة / تحميل');
      if (canShare) {
        await page.waitForFunction(() => window.__shared);
        const shared = await page.evaluate(() => window.__shared);
        assert.equal(shared.type, 'image/png');
        assert.match(shared.name, /^quran-112-1\.png$/);
        assert.ok(shared.size > 20_000);
      } else {
        for (let i = 0; i < 40 && !readdirSync(dl).some((f) => f.endsWith('.png')); i++) await sleep(250);
        const file = readdirSync(dl).find((f) => f.endsWith('.png'));
        assert.ok(file, 'PNG downloaded');
        assert.equal(file, 'quran-2-282.png');
        assert.ok(statSync(join(dl, file)).size > 20_000);
      }
      assert.deepEqual(errors, []);
      await ctx.close();
    });
  }
});

describe('existing features still work', () => {
  test('search (typo correction), suggestions, cart from a reading page and PDF export', async () => {
    const { ctx, page } = await fresh();
    await page.goto(`${BASE}/search?q=${encodeURIComponent('الحمد لله رب العالمن')}`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('article');
    assert.match(await textOf(page, 'main'), /تم البحث عن/);
    assert.ok((await page.$$('mark.hl')).length > 0);
    assert.ok(await page.$('button[aria-label="بحث صوتي"], main p')); // mic button (or the unsupported note)

    await page.goto(`${BASE}/surah/112`, { waitUntil: 'networkidle0' });
    await clickText(page, '#ayah-6222 button', 'أضف للسلة');
    await clickText(page, '#ayah-6223 button', 'أضف للسلة');
    assert.deepEqual(await storage(page, 'quran_cart'), [{ ayahId: 6222 }, { ayahId: 6223 }]);

    await page.goto(`${BASE}/cart`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('ol li .quran-text');
    const dl = mkdtempSync(join(tmpdir(), 'pdf-'));
    const cdp = await page.createCDPSession();
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl, browserContextId: ctx.id });
    await clickText(page, 'button', 'تحميل PDF');
    for (let i = 0; i < 60 && !readdirSync(dl).some((f) => f.endsWith('.pdf')); i++) await sleep(250);
    const pdf = readdirSync(dl).find((f) => f.endsWith('.pdf'));
    assert.ok(pdf, 'PDF downloaded');
    assert.ok(statSync(join(dl, pdf)).size > 10_000);
    await ctx.close();
  });
});

describe('API failure', { skip: !process.env.E2E_DEAD_API_URL && 'set E2E_DEAD_API_URL to run' }, () => {
  test('reading pages show the error boundary; home still renders', async () => {
    const dead = process.env.E2E_DEAD_API_URL.replace(/\/+$/, '');
    const { ctx, page } = await fresh();
    await page.goto(`${dead}/surah/2`, { waitUntil: 'networkidle0' });
    assert.match(await textOf(page, 'main'), /تعذّر تحميل الصفحة/);
    await page.goto(`${dead}/khatma`, { waitUntil: 'networkidle0' });
    assert.match(await textOf(page, 'main'), /تعذّر تحميل الصفحة/);
    // error pages are never recorded as "last page", so "/" stays on the (working) home page
    assert.equal(await storage(page, 'quran_last_route'), null);
    await page.goto(`${dead}/`, { waitUntil: 'networkidle0' });
    assert.equal(await page.evaluate(() => location.pathname), '/');
    assert.match(await textOf(page, 'main'), /قراءة القرآن/);
    await ctx.close();
  });
});
