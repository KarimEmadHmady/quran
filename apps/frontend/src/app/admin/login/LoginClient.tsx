'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import { Alert, Spinner } from '@/components/admin/ui';
import { Icon } from '@/components/Icon';
import { adminErrorMessage, safeAdminNext, validateLogin } from '@/lib/admin';
import { adminApi, AdminApiError } from '@/lib/adminApi';

/** Envelope / padlock glyphs for the field labels (page-local; not in the shared icon set). */
function LabelGlyph({ kind }: { kind: 'mail' | 'lock' }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path
        d={
          kind === 'mail'
            ? 'M4 6h16v12H4zM4 7l8 6 8-6'
            : 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3M12 15v2'
        }
      />
    </svg>
  );
}

/** Soft filled input with an icon label + inline error (same a11y wiring as the shared admin Field). */
function LoginField({
  label,
  icon,
  error,
  trailing,
  ...props
}: {
  label: string;
  icon: 'mail' | 'lock';
  error?: string;
  trailing?: React.ReactNode;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="flex items-center gap-1.5 text-sm font-semibold text-[var(--fg)]">
        <LabelGlyph kind={icon} />
        {label}
      </label>
      <div className="relative">
        <input
          {...props}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          className={`h-12 w-full rounded-2xl border bg-[var(--surface-2)] px-4 text-[0.95rem] text-[var(--fg)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:bg-[var(--surface)] focus:ring-2 focus:ring-[var(--accent)]/20 disabled:opacity-60 ${
            trailing ? 'pl-12' : ''
          } ${error ? 'border-[var(--danger)]' : 'border-transparent'}`}
        />
        {trailing && <div className="absolute inset-y-0 left-2 flex items-center">{trailing}</div>}
      </div>
      {error && (
        <p id={`${id}-err`} className="text-xs text-[var(--danger)]">
          {error}
        </p>
      )}
    </div>
  );
}

export function LoginClient({ next, notice }: { next?: string; notice: 'expired' | 'logged_out' | null }) {
  const router = useRouter();
  const target = safeAdminNext(next);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Already signed in -> straight to the dashboard (no login form for an active session).
  useEffect(() => {
    const ctrl = new AbortController();
    adminApi
      .me(ctrl.signal)
      .then(() => router.replace(target))
      .catch((err: unknown) => {
        if ((err as Error).name !== 'AbortError') setChecking(false);
      });
    return () => ctrl.abort();
  }, [router, target]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setFormError(null);
    const v = validateLogin({ email, password });
    setErrors(v);
    if (v.email || v.password) return;
    setBusy(true);
    try {
      await adminApi.login(email.trim(), password);
      setPassword('');
      router.replace(target);
    } catch (err) {
      setFormError(adminErrorMessage(err instanceof AdminApiError ? err.status : 0, 'login'));
      setPassword('');
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--bg)] px-4 py-10" data-no-restore>
      {/* Faint mosque silhouette behind the page (decorative). */}
      {/* eslint-disable-next-line @next/next/no-img-element -- decorative static image */}
      <img
        src="/mosque-bg.png"
        alt=""
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 w-[160%] max-w-[60rem] -translate-x-1/2 select-none opacity-60 dark:opacity-[0.05]"
      />

      <div className="relative w-full max-w-md">
        <div className="mb-7 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- static logo */}
          <img
            src="/logo-mark.png"
            alt=""
            aria-hidden
            width={96}
            height={96}
            className="mb-4 h-24 w-24 object-contain dark:rounded-full dark:bg-[#f8f7f3] dark:p-2"
          />
          <h1 className="text-[1.65rem] font-extrabold text-[var(--accent)]">لوحة التحكم</h1>
          <p className="mt-2 text-sm leading-7 text-[var(--muted)]">تسجيل دخول المشرفين</p>
        </div>

        <div className="rounded-[1.75rem] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_10px_40px_-12px_rgba(23,88,74,0.18)] sm:p-7">
          {checking ? (
            <Spinner label="جارٍ التحقق…" />
          ) : (
            <form onSubmit={submit} noValidate className="space-y-5" aria-label="تسجيل الدخول">
              {notice === 'expired' && <Alert kind="info">انتهت الجلسة. سجّل الدخول مرة أخرى.</Alert>}
              {notice === 'logged_out' && <Alert kind="success">تم تسجيل الخروج.</Alert>}
              {formError && <Alert kind="error">{formError}</Alert>}
              <LoginField
                label="البريد الإلكتروني"
                icon="mail"
                type="email"
                name="email"
                autoComplete="username"
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={errors.email}
                disabled={busy}
                required
              />
              <LoginField
                label="كلمة المرور"
                icon="lock"
                type={showPassword ? 'text' : 'password'}
                name="password"
                autoComplete="current-password"
                dir="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={errors.password}
                disabled={busy}
                required
                trailing={
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                    aria-pressed={showPassword}
                    className="rounded-full p-2 text-[var(--muted)] transition hover:text-[var(--fg)]"
                  >
                    <Icon name="eyeOff" className={`h-5 w-5 ${showPassword ? 'opacity-50' : ''}`} />
                  </button>
                }
              />
              <button
                type="submit"
                disabled={busy}
                aria-busy={busy || undefined}
                className="mt-2 inline-flex h-14 w-full items-center justify-center gap-3 rounded-full bg-gradient-to-l from-[#1f4f40] to-[#0b3328] text-base font-semibold text-white shadow-[0_8px_20px_-8px_rgba(11,51,40,0.6)] transition hover:brightness-110 disabled:opacity-70"
              >
                {busy ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
                ) : null}
                {busy ? 'جارٍ الدخول…' : 'تسجيل الدخول'}
                {!busy && <Icon name="back" className="h-5 w-5 rotate-180" />}
              </button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-xs leading-6 text-[var(--muted)]">
          لا يوجد تسجيل حسابات جديدة. الحسابات يضيفها مسؤول النظام فقط.
        </p>
      </div>
    </div>
  );
}
