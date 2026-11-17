/**
 * Pure admin dashboard logic (Phase 6): form validation, reference parsing, safe redirects and
 * error wording. Kept free of React / fetch so it is unit-tested directly.
 * Limits mirror the backend DTOs (apps/backend/src/admin/content/dto/admin-content.dto.ts).
 */

export const LIMITS = {
  emailMax: 190,
  passwordMax: 200,
  suraName: 60,
  topicTitle: 255,
  topicDescription: 5000,
  bookName: 100,
  bookAuthor: 150,
  linkBatch: 100,
} as const;

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateLogin(input: { email: string; password: string }): FieldErrors<'email' | 'password'> {
  const errors: FieldErrors<'email' | 'password'> = {};
  const email = input.email.trim();
  if (!email) errors.email = 'أدخل البريد الإلكتروني';
  else if (!EMAIL.test(email) || email.length > LIMITS.emailMax) errors.email = 'البريد الإلكتروني غير صحيح';
  if (!input.password) errors.password = 'أدخل كلمة المرور';
  else if (input.password.length > LIMITS.passwordMax) errors.password = 'كلمة المرور طويلة جداً';
  return errors;
}

function required(value: string, max: number, label: string): string | undefined {
  const v = value.trim();
  if (!v) return `${label} مطلوب`;
  if (v.length > max) return `${label} لا يزيد عن ${max} حرفاً`;
  return undefined;
}

function optional(value: string, max: number, label: string): string | undefined {
  return value.trim().length > max ? `${label} لا يزيد عن ${max} حرفاً` : undefined;
}

const clean = <K extends string>(e: FieldErrors<K>): FieldErrors<K> =>
  Object.fromEntries(Object.entries(e).filter(([, v]) => v)) as FieldErrors<K>;

export function validateSura(input: { nameAr: string; nameEn: string }): FieldErrors<'nameAr' | 'nameEn'> {
  const nameAr =
    required(input.nameAr, LIMITS.suraName, 'الاسم العربي') ??
    (/[ء-ي]/.test(input.nameAr) ? undefined : 'الاسم العربي لازم يحتوي على حروف عربية');
  return clean({ nameAr, nameEn: required(input.nameEn, LIMITS.suraName, 'الاسم الإنجليزي') });
}

export function validateTopic(input: { title: string; description: string }): FieldErrors<'title' | 'description'> {
  return clean({
    title: required(input.title, LIMITS.topicTitle, 'العنوان'),
    description: optional(input.description, LIMITS.topicDescription, 'الوصف'),
  });
}

export function validateBook(input: { name: string; author: string }): FieldErrors<'name' | 'author'> {
  return clean({
    name: required(input.name, LIMITS.bookName, 'اسم الكتاب'),
    author: optional(input.author, LIMITS.bookAuthor, 'المؤلف'),
  });
}

export interface AyahRef {
  sura: number;
  ayah: number;
}

const toLatinDigits = (s: string) =>
  s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

/**
 * "2:255, 1:1-3 ١١٢:١" -> refs (ranges expanded, duplicates removed, order kept).
 * Separators: comma (Latin or Arabic), whitespace, newline. Returns the invalid tokens too.
 */
export function parseAyahRefs(input: string): { refs: AyahRef[]; invalid: string[] } {
  const refs: AyahRef[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const token of toLatinDigits(input).split(/[\s,،]+/).filter(Boolean)) {
    const m = /^(\d{1,3})[:/](\d{1,3})(?:-(\d{1,3}))?$/.exec(token);
    if (!m) {
      invalid.push(token);
      continue;
    }
    const sura = Number(m[1]);
    const from = Number(m[2]);
    const to = m[3] ? Number(m[3]) : from;
    if (sura < 1 || sura > 114 || from < 1 || to < from || to - from >= LIMITS.linkBatch) {
      invalid.push(token);
      continue;
    }
    for (let ayah = from; ayah <= to; ayah++) {
      const key = `${sura}:${ayah}`;
      if (!seen.has(key)) {
        seen.add(key);
        refs.push({ sura, ayah });
      }
    }
  }
  return { refs, invalid };
}

/** Only same-app dashboard paths are accepted as a post-login target (no open redirect). */
export function safeAdminNext(next: string | null | undefined): string {
  if (!next || !/^\/admin\/dashboard(?:[/?#]|$)/.test(next) || /[\\\s]|\/\//.test(next)) {
    return '/admin/dashboard';
  }
  return next;
}

export type ErrorContext = 'login' | 'save' | 'delete' | 'load' | 'link';

/**
 * User-facing Arabic message for an API failure. Never echoes server text for 401 / 5xx, so
 * nothing about accounts or internals leaks; 400 / 404 / 409 get a specific but generic line.
 */
export function adminErrorMessage(status: number, context: ErrorContext): string {
  if (status === 0) return 'تعذّر الاتصال بالخادم. تأكد من الاتصال وحاول مرة أخرى.';
  if (context === 'login') {
    if (status === 401 || status === 400) return 'البريد الإلكتروني أو كلمة المرور غير صحيحة';
    if (status === 429) return 'محاولات كثيرة. انتظر قليلاً ثم حاول مرة أخرى.';
    return 'تعذّر تسجيل الدخول الآن. حاول مرة أخرى بعد قليل.';
  }
  if (status === 401) return 'انتهت الجلسة. سجّل الدخول مرة أخرى.';
  if (status === 404) return context === 'link' ? 'آية أو أكثر غير موجودة' : 'العنصر غير موجود (ربما حُذف)';
  if (status === 409) {
    return context === 'delete'
      ? 'لا يمكن الحذف: احذف المواضيع الفرعية أو انقلها أولاً'
      : 'يوجد عنصر بنفس الاسم في نفس المكان';
  }
  if (status === 400) return 'البيانات غير صحيحة. راجع الحقول وحاول مرة أخرى.';
  if (status === 429) return 'طلبات كثيرة. انتظر قليلاً ثم حاول مرة أخرى.';
  if (status === 503) return 'الخدمة غير متاحة مؤقتاً. حاول بعد قليل.';
  return context === 'load' ? 'تعذّر تحميل البيانات' : 'تعذّر حفظ التغييرات';
}

/** "1–50 من 183" */
export function rangeLabel(page: number, limit: number, total: number): string {
  if (total === 0) return '0 من 0';
  const from = (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);
  return `${from}–${to} من ${total}`;
}
