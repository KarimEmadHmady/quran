'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Alert, Button, Field, Spinner } from '@/components/admin/ui';
import { adminErrorMessage, safeAdminNext, validateLogin } from '@/lib/admin';
import { adminApi, AdminApiError } from '@/lib/adminApi';

export function LoginClient({ next, notice }: { next?: string; notice: 'expired' | 'logged_out' | null }) {
  const router = useRouter();
  const target = safeAdminNext(next);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    <div className="flex min-h-screen items-center justify-center px-4 py-10" data-no-restore>
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold">لوحة التحكم</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">تسجيل دخول المشرفين</p>
        </div>
        <div className="ui-card p-6">
          {checking ? (
            <Spinner label="جارٍ التحقق…" />
          ) : (
            <form onSubmit={submit} noValidate className="space-y-4" aria-label="تسجيل الدخول">
              {notice === 'expired' && <Alert kind="info">انتهت الجلسة. سجّل الدخول مرة أخرى.</Alert>}
              {notice === 'logged_out' && <Alert kind="success">تم تسجيل الخروج.</Alert>}
              {formError && <Alert kind="error">{formError}</Alert>}
              <Field
                label="البريد الإلكتروني"
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
              <Field
                label="كلمة المرور"
                type="password"
                name="password"
                autoComplete="current-password"
                dir="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={errors.password}
                disabled={busy}
                required
              />
              <Button type="submit" busy={busy} className="w-full py-3">
                {busy ? 'جارٍ الدخول…' : 'تسجيل الدخول'}
              </Button>
            </form>
          )}
        </div>
        <p className="mt-4 text-center text-xs text-[var(--muted)]">
          لا يوجد تسجيل حسابات جديدة. الحسابات يضيفها مسؤول النظام فقط.
        </p>
      </div>
    </div>
  );
}
