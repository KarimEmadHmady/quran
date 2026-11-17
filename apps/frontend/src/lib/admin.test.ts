import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAdminPath } from '@/components/AppChrome';
import {
  adminErrorMessage,
  parseAyahRefs,
  rangeLabel,
  safeAdminNext,
  validateBook,
  validateLogin,
  validateSura,
  validateTopic,
} from './admin';
import { adminApi, AdminApiError, adminFetch, setUnauthorizedHandler } from './adminApi';

describe('validateLogin', () => {
  it('requires a valid email and a password', () => {
    expect(validateLogin({ email: '', password: '' })).toEqual({
      email: 'أدخل البريد الإلكتروني',
      password: 'أدخل كلمة المرور',
    });
    expect(validateLogin({ email: 'nope', password: 'x' }).email).toBe('البريد الإلكتروني غير صحيح');
    expect(validateLogin({ email: ' admin@quran.com ', password: 'secret' })).toEqual({});
    expect(validateLogin({ email: 'a@b.co', password: 'x'.repeat(201) }).password).toBeDefined();
  });
});

describe('form validation', () => {
  it('topic: title required (trimmed) and length-capped; description optional', () => {
    expect(validateTopic({ title: '   ', description: '' })).toEqual({ title: 'العنوان مطلوب' });
    expect(validateTopic({ title: 'x'.repeat(256), description: '' }).title).toContain('255');
    expect(validateTopic({ title: 'ok', description: 'x'.repeat(5001) }).description).toContain('5000');
    expect(validateTopic({ title: 'الدعاء', description: '' })).toEqual({});
  });

  it('sura: both names required, Arabic name must have Arabic letters, 60 chars max', () => {
    expect(validateSura({ nameAr: '', nameEn: '' })).toEqual({
      nameAr: 'الاسم العربي مطلوب',
      nameEn: 'الاسم الإنجليزي مطلوب',
    });
    expect(validateSura({ nameAr: 'Latin', nameEn: 'x' }).nameAr).toContain('حروف عربية');
    expect(validateSura({ nameAr: 'ب'.repeat(61), nameEn: 'x' }).nameAr).toContain('60');
    expect(validateSura({ nameAr: 'البقرة', nameEn: 'Al-Baqarah' })).toEqual({});
  });

  it('tafsir book: name required, author optional', () => {
    expect(validateBook({ name: '', author: '' })).toEqual({ name: 'اسم الكتاب مطلوب' });
    expect(validateBook({ name: 'x', author: 'x'.repeat(151) }).author).toContain('150');
    expect(validateBook({ name: 'تفسير', author: '' })).toEqual({});
  });
});

describe('parseAyahRefs', () => {
  it('parses lists, ranges, Arabic-Indic digits and Arabic commas; dedupes in order', () => {
    expect(parseAyahRefs('2:255, 1:1-3 ١١٢:١،2:255')).toEqual({
      refs: [
        { sura: 2, ayah: 255 },
        { sura: 1, ayah: 1 },
        { sura: 1, ayah: 2 },
        { sura: 1, ayah: 3 },
        { sura: 112, ayah: 1 },
      ],
      invalid: [],
    });
    expect(parseAyahRefs('2/255').refs).toEqual([{ sura: 2, ayah: 255 }]);
  });

  it('reports invalid tokens (bad shape, sura out of range, reversed / huge ranges)', () => {
    expect(parseAyahRefs('abc 0:1 115:1 2:0 2:5-3 2:1-200 2:255').invalid).toEqual([
      'abc',
      '0:1',
      '115:1',
      '2:0',
      '2:5-3',
      '2:1-200',
    ]);
    expect(parseAyahRefs('').refs).toEqual([]);
  });
});

describe('safeAdminNext (no open redirect)', () => {
  it.each([
    [undefined, '/admin/dashboard'],
    ['/admin/dashboard/topics?page=2', '/admin/dashboard/topics?page=2'],
    ['/admin/dashboard', '/admin/dashboard'],
    ['https://evil.example/admin/dashboard', '/admin/dashboard'],
    ['//evil.example', '/admin/dashboard'],
    ['/admin/dashboard//evil.example', '/admin/dashboard'],
    ['/admin/dashboardx', '/admin/dashboard'],
    ['/admin/login', '/admin/dashboard'],
    ['/\\evil.example', '/admin/dashboard'],
    ['javascript:alert(1)', '/admin/dashboard'],
  ])('%s -> %s', (input, expected) => {
    expect(safeAdminNext(input)).toBe(expected);
  });
});

describe('adminErrorMessage', () => {
  it('never reveals whether the email or the password was wrong', () => {
    expect(adminErrorMessage(401, 'login')).toBe(adminErrorMessage(400, 'login'));
    expect(adminErrorMessage(401, 'login')).toBe('البريد الإلكتروني أو كلمة المرور غير صحيحة');
  });

  it('maps statuses to generic Arabic messages', () => {
    expect(adminErrorMessage(0, 'load')).toContain('الاتصال');
    expect(adminErrorMessage(429, 'login')).toContain('محاولات كثيرة');
    expect(adminErrorMessage(409, 'delete')).toContain('المواضيع الفرعية');
    expect(adminErrorMessage(409, 'save')).toContain('بنفس الاسم');
    expect(adminErrorMessage(404, 'link')).toContain('آية');
    expect(adminErrorMessage(500, 'save')).toBe('تعذّر حفظ التغييرات');
    expect(adminErrorMessage(500, 'load')).toBe('تعذّر تحميل البيانات');
  });
});

it('rangeLabel', () => {
  expect(rangeLabel(1, 20, 183)).toBe('1–20 من 183');
  expect(rangeLabel(10, 20, 183)).toBe('181–183 من 183');
  expect(rangeLabel(1, 20, 0)).toBe('0 من 0');
});

it('isAdminPath', () => {
  expect(isAdminPath('/admin')).toBe(true);
  expect(isAdminPath('/admin/dashboard/topics')).toBe(true);
  expect(isAdminPath('/administrator')).toBe(false);
  expect(isAdminPath('/surah/1')).toBe(false);
  expect(isAdminPath(null)).toBe(false);
});

describe('adminFetch', () => {
  afterEach(() => setUnauthorizedHandler(null));

  const respond = (status: number, body?: unknown) =>
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

  it('always sends the session cookie and JSON bodies; never an Authorization header', async () => {
    const spy = respond(200, { data: [] });
    await adminApi.linkAyahs(5, [1, 2]);
    const [url, init] = spy.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toMatch(/\/admin\/topics\/5\/ayahs$/);
    expect(init.credentials).toBe('include');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"ayahIds":[1,2]}');
    expect(JSON.stringify(init.headers)).not.toMatch(/authorization/i);
  });

  it('skips empty query values', async () => {
    const spy = respond(200, { data: [], pagination: {} });
    await adminApi.topics({ q: '', status: 'all', page: 2 });
    expect(String(spy.mock.calls[0][0])).toMatch(/\/admin\/topics\?status=all&page=2$/);
  });

  it('calls the unauthorized handler on a 401 (but not for login / me)', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    respond(401, { message: 'Authentication required' });
    await expect(adminApi.stats()).rejects.toMatchObject({ status: 401 });
    expect(handler).toHaveBeenCalledTimes(1);
    respond(401, { message: 'Invalid email or password' });
    await expect(adminApi.login('a@b.co', 'x')).rejects.toBeInstanceOf(AdminApiError);
    await expect(adminApi.me()).rejects.toBeInstanceOf(AdminApiError);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('204 -> undefined; network failure -> status 0', async () => {
    respond(204);
    await expect(adminApi.deleteTopic(3)).resolves.toBeUndefined();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(adminFetch('/admin/stats')).rejects.toMatchObject({ status: 0 });
  });
});
