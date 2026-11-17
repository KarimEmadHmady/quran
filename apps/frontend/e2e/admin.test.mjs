/**
 * Admin dashboard browser journeys (Phase 6, claude.md 11.17).
 *
 * These tests WRITE (topics, a tafsir book author, restored at the end), so the backend behind
 * E2E_BASE_URL must use the isolated test database (`npm run db:test:create`, then
 * `npm run seed:admin` against it). They are skipped unless E2E_ADMIN_PASSWORD is set.
 *   E2E_ADMIN_EMAIL (default admin@quran.com), E2E_ADMIN_PASSWORD, E2E_API_URL (for cookie checks)
 * Every test gets a fresh incognito context (no session, empty localStorage).
 */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import puppeteer from 'puppeteer-core';

const BASE = (process.env.E2E_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const API = (process.env.E2E_API_URL ?? 'http://localhost:3001').replace(/\/+$/, '');
const EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@quran.com';
const PASSWORD = process.env.E2E_ADMIN_PASSWORD;
const CANDIDATES = [
  process.env.E2E_CHROME,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

let browser;
const skip = !PASSWORD && 'set E2E_ADMIN_PASSWORD (and point the backend at the test database) to run';

async function fresh({ width = 1280, height = 900 } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width, height });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  return { ctx, page, errors };
}
const text = (page, sel = 'body') => page.$eval(sel, (el) => el.textContent ?? '');
const waitText = (page, needle, sel = 'body') =>
  page.waitForFunction((n, s) => document.querySelector(s)?.textContent?.includes(n), { timeout: 15000 }, needle, sel);
const waitPath = (page, re) =>
  page.waitForFunction((src) => new RegExp(src).test(location.pathname + location.search), { timeout: 15000 }, re.source);
async function clickText(page, selector, needle) {
  for (const h of await page.$$(selector)) {
    if (((await h.evaluate((el) => el.textContent)) ?? '').includes(needle)) return h.click();
  }
  throw new Error(`no ${selector} containing ${needle}`);
}
async function typeInto(page, selector, value) {
  await page.$eval(selector, (el) => {
    el.value = '';
  });
  await page.focus(selector);
  await page.keyboard.type(value);
}
async function login(page, next) {
  await page.goto(`${BASE}/admin/login${next ? `?next=${encodeURIComponent(next)}` : ''}`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('input[name=email]');
  await page.type('input[name=email]', EMAIL);
  await page.type('input[name=password]', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForSelector('[data-testid=admin-shell]', { timeout: 15000 });
}

before(async () => {
  if (skip) return;
  const executablePath = CANDIDATES.find((p) => existsSync(p));
  assert.ok(executablePath, 'no Chrome/Edge found (set E2E_CHROME)');
  browser = await puppeteer.launch({ executablePath, headless: true });
});
after(async () => browser?.close());

describe('admin: access control', { skip }, () => {
  test('unauthenticated visits go to the login page; no sign-up exists; reader chrome is hidden', async () => {
    const { ctx, page, errors } = await fresh();
    await page.goto(`${BASE}/admin/dashboard/topics`, { waitUntil: 'networkidle0' });
    await waitPath(page, /^\/admin\/login\?next=%2Fadmin%2Fdashboard%2Ftopics$/);
    await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle0' });
    await waitPath(page, /^\/admin\/login/);

    assert.equal(await page.$('nav[aria-label="التنقل الرئيسي"]'), null, 'reader bottom nav hidden');
    assert.doesNotMatch(await text(page), /إنشاء حساب|تسجيل جديد|sign ?up|register/i);
    assert.equal(await page.$eval('html', (h) => h.getAttribute('dir')), 'rtl');
    for (const p of ['/admin/register', '/admin/signup']) {
      const res = await page.goto(`${BASE}${p}`, { waitUntil: 'networkidle0' });
      assert.equal(res.status(), 404, p);
    }
    // The dashboard API itself refuses direct requests without a session.
    const status = await page.evaluate(async (api) => (await fetch(`${api}/admin/stats`, { credentials: 'include' })).status, API);
    assert.equal(status, 401);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  test('login: client validation, generic error for bad credentials, then success to `next`', async () => {
    const { ctx, page, errors } = await fresh();
    await page.goto(`${BASE}/admin/login?next=${encodeURIComponent('/admin/dashboard/suras')}`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('input[name=email]');

    await page.click('button[type=submit]');
    await waitText(page, 'أدخل البريد الإلكتروني');
    assert.match(await text(page), /أدخل كلمة المرور/);
    assert.equal(await page.$eval('input[name=email]', (el) => el.getAttribute('aria-invalid')), 'true');

    await page.type('input[name=email]', EMAIL);
    await page.type('input[name=password]', `${PASSWORD}-wrong`);
    await page.click('button[type=submit]');
    await waitText(page, 'البريد الإلكتروني أو كلمة المرور غير صحيحة');
    assert.equal(await page.$eval('input[name=password]', (el) => el.value), '', 'password cleared after failure');

    await page.type('input[name=password]', PASSWORD);
    await page.click('button[type=submit]');
    await page.waitForSelector('[data-testid=sura-table]', { timeout: 15000 });
    assert.match(page.url(), /\/admin\/dashboard\/suras$/);

    // The session is an httpOnly cookie: invisible to page scripts.
    assert.doesNotMatch(await page.evaluate(() => document.cookie), /qa_admin_session/);
    const cookies = await page.browserContext().cookies();
    const session = cookies.find((c) => c.name === 'qa_admin_session');
    assert.ok(session?.httpOnly, 'httpOnly session cookie');
    assert.equal(session.path, '/admin');
    assert.equal(await page.evaluate(() => JSON.stringify(localStorage)).then((s) => /qa_admin|token|jwt/i.test(s)), false);

    // Signed in -> the login page bounces to the dashboard.
    await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle0' });
    await waitPath(page, /^\/admin\/dashboard$/);
    await page.waitForSelector('[data-testid=stats]');
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  test('an expired / removed session sends the admin back to login with a notice', async () => {
    const { ctx, page } = await fresh();
    await login(page);
    await page.waitForSelector('[data-testid=stats]');
    const [session] = (await page.browserContext().cookies()).filter((c) => c.name === 'qa_admin_session');
    await page.browserContext().deleteCookie(session);
    await clickText(page, 'aside a', 'المواضيع');
    await waitPath(page, /^\/admin\/login\?expired=1&next=/);
    await waitText(page, 'انتهت الجلسة');
    await ctx.close();
  });

  test('logout clears the session; the dashboard is protected again', async () => {
    const { ctx, page } = await fresh();
    await login(page);
    await page.click('[data-testid=profile-button]');
    assert.match(await text(page, '[role=menu]'), new RegExp(EMAIL.replace('.', '\\.')));
    await page.click('[data-testid=logout-button]');
    await waitPath(page, /^\/admin\/login\?logged_out=1$/);
    await waitText(page, 'تم تسجيل الخروج');
    assert.equal((await page.browserContext().cookies()).some((c) => c.name === 'qa_admin_session'), false);
    await page.goto(`${BASE}/admin/dashboard`, { waitUntil: 'networkidle0' });
    await waitPath(page, /^\/admin\/login/);
    await ctx.close();
  });
});

describe('admin: content management', { skip }, () => {
  test('topics: validate, create, search, link / unlink ayahs, ban, delete (with confirmations)', async () => {
    const { ctx, page, errors } = await fresh();
    await login(page, '/admin/dashboard/topics');
    await page.waitForSelector('[data-testid=topic-list]');
    const title = `موضوع اختبار ${Date.now()}`;

    await page.click('[data-testid=new-topic]');
    await page.waitForSelector('form[aria-label="موضوع جديد"]');
    await page.click('form[aria-label="موضوع جديد"] button[type=submit]');
    await waitText(page, 'العنوان مطلوب');
    await page.type('form[aria-label="موضوع جديد"] input[name=title]', title);
    await page.click('form[aria-label="موضوع جديد"] button[type=submit]');
    await waitText(page, 'تمت إضافة الموضوع', '[aria-live]');

    await page.type('#topic-search', title);
    await page.waitForFunction(
      (t) => [...document.querySelectorAll('[data-testid=topic-row]')].length === 1 && document.querySelector('[data-testid=topic-row]').textContent.includes(t),
      { timeout: 15000 },
      title,
    );
    // Duplicate title -> 409 shown in the form.
    await page.click('[data-testid=new-topic]');
    await page.type('form[aria-label="موضوع جديد"] input[name=title]', title);
    await page.click('form[aria-label="موضوع جديد"] button[type=submit]');
    await waitText(page, 'يوجد عنصر بنفس الاسم');
    await page.keyboard.press('Escape');

    await clickText(page, '[data-testid=topic-row] a', title);
    await page.waitForSelector('form[aria-label="ربط آيات"]');
    await page.type('form[aria-label="ربط آيات"] input[name=refs]', 'abc');
    await page.click('form[aria-label="ربط آيات"] button[type=submit]');
    await waitText(page, 'مراجع غير صحيحة');
    await typeInto(page, 'form[aria-label="ربط آيات"] input[name=refs]', '112:1-4, 112:9');
    await page.click('form[aria-label="ربط آيات"] button[type=submit]');
    await waitText(page, 'آيات غير موجودة: 112:9');
    await typeInto(page, 'form[aria-label="ربط آيات"] input[name=refs]', '112:1-4');
    await page.click('form[aria-label="ربط آيات"] button[type=submit]');
    await page.waitForFunction(() => document.querySelectorAll('[data-testid=linked-ayah]').length === 4, { timeout: 15000 });

    await page.click('[data-testid=linked-ayah] button[aria-label^="فك ربط"]');
    await page.waitForSelector('[data-testid=confirm-button]');
    await page.click('[data-testid=confirm-button]');
    await page.waitForFunction(() => document.querySelectorAll('[data-testid=linked-ayah]').length === 3, { timeout: 15000 });

    await clickText(page, 'button', 'حظر');
    await page.waitForSelector('[data-testid=confirm-button]');
    await page.click('[data-testid=confirm-button]');
    await waitText(page, 'مخفي عن المستخدمين');

    // Public API no longer serves it.
    const id = Number(page.url().split('/').pop());
    const pub = await page.evaluate(async (api, tid) => (await fetch(`${api}/topics/${tid}`)).status, API, id);
    assert.equal(pub, 404);

    await clickText(page, 'button', 'حذف');
    await page.waitForSelector('[data-testid=confirm-button]');
    assert.match(await text(page, '[role=dialog]'), /الآيات نفسها لن تتأثر/);
    await page.click('[data-testid=confirm-button]');
    await waitPath(page, /^\/admin\/dashboard\/topics$/);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  test('suras: name validation; tafsir books: hidden badge, edit author and restore', async () => {
    const { ctx, page, errors } = await fresh();
    await login(page, '/admin/dashboard/suras');
    await page.waitForSelector('[data-testid=sura-table]');
    assert.equal((await page.$$('[data-testid=sura-table] tbody tr')).length, 114);
    await page.type('#sura-filter', 'الكهف');
    await page.waitForFunction(() => document.querySelectorAll('[data-testid=sura-table] tbody tr').length === 1);
    await page.click('[data-testid=sura-table] tbody tr button');
    await typeInto(page, 'input[name=nameAr]', ' ');
    await page.click('form[aria-label="تعديل اسم السورة"] button[type=submit]');
    await waitText(page, 'الاسم العربي مطلوب');
    await typeInto(page, 'input[name=nameAr]', 'البقرة');
    await page.click('form[aria-label="تعديل اسم السورة"] button[type=submit]');
    await waitText(page, 'اسم مستخدم لسورة أخرى');
    await page.keyboard.press('Escape');

    await page.goto(`${BASE}/admin/dashboard/tafsir-books`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('[data-testid=book-row]');
    assert.equal((await page.$$('[data-testid=book-row]')).length, 5);
    const hiddenBadges = await page.$$eval('[data-testid=book-row] .ui-badge', (b) => b.filter((x) => x.textContent === 'مخفي').length);
    assert.equal(hiddenBadges, 4);
    const rows = await page.$$('[data-testid=book-row]');
    const original = await rows[1].$eval('p.text-sm', (p) => p.textContent);
    await (await rows[1].$('button')).click();
    await typeInto(page, 'input[name=author]', 'مؤلف اختبار');
    await page.click('form[aria-label="تعديل كتاب التفسير"] button[type=submit]');
    await waitText(page, 'مؤلف اختبار', '[data-testid=book-list]');
    // restore
    await (await (await page.$$('[data-testid=book-row]'))[1].$('button')).click();
    await typeInto(page, 'input[name=author]', original === 'المؤلف غير محدد' ? '' : original);
    await page.click('form[aria-label="تعديل كتاب التفسير"] button[type=submit]');
    await waitText(page, original, '[data-testid=book-list]');

    // Read-only tafsir browser shows hidden books flagged.
    await page.goto(`${BASE}/admin/dashboard/tafsirs`, { waitUntil: 'networkidle0' });
    await page.type('input[name=ref]', '2:255');
    await page.click('form[aria-label="عرض تفاسير آية"] button[type=submit]');
    await page.waitForSelector('[data-testid=tafsir-list]');
    assert.match(await text(page, '[data-testid=tafsir-list]'), /مخفي/);
    assert.equal(await page.$('textarea'), null, 'no editor for tafsir text');
    assert.deepEqual(errors, []);
    await ctx.close();
  });
});

describe('admin: layout', { skip }, () => {
  test('mobile: drawer navigation, no horizontal scroll, RTL; theme toggle; admin is never "last page"', async () => {
    const { ctx, page, errors } = await fresh({ width: 390, height: 844 });
    await login(page);
    await page.waitForSelector('[data-testid=stats]');
    assert.equal(await page.$eval('aside', (a) => getComputedStyle(a).display), 'none', 'sidebar hidden on mobile');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

    await page.click('button[aria-label="فتح القائمة"]');
    await page.waitForSelector('[role=dialog][aria-label="القائمة"]');
    await clickText(page, '[role=dialog] a', 'كتب التفسير');
    await waitPath(page, /^\/admin\/dashboard\/tafsir-books$/);
    await page.waitForSelector('[data-testid=book-row]');
    assert.equal(await page.$('[role=dialog][aria-label="القائمة"]'), null, 'drawer closes on navigation');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

    for (const p of ['topics', 'suras', 'ayahs', 'tafsirs']) {
      await page.goto(`${BASE}/admin/dashboard/${p}`, { waitUntil: 'networkidle0' });
      await page.waitForSelector('main h1');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `no overflow on ${p}`);
    }

    const before = await page.$eval('html', (h) => h.classList.contains('dark'));
    await page.click('header button[aria-label="الوضع الليلي"], header button[aria-label="الوضع النهاري"]');
    await page.waitForFunction((b) => document.documentElement.classList.contains('dark') !== b, {}, before);

    const last = await page.evaluate(() => localStorage.getItem('quran_last_route'));
    assert.equal(last, null, 'admin pages are not recorded as the reader last page');
    assert.deepEqual(errors, []);
    await ctx.close();
  });
});
