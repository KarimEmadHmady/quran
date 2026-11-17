'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { adminApi, AdminApiError, setUnauthorizedHandler, type AdminProfile } from '@/lib/adminApi';
import { resolvedTheme, useSettingsStore } from '@/store/useSettingsStore';
import { Icon, type IconName } from '../Icon';
import { ErrorState, Spinner, ToastProvider } from './ui';

const AdminContext = createContext<AdminProfile | null>(null);
/** The signed-in admin (only rendered inside the guard, so never null there). */
export const useAdmin = () => useContext(AdminContext)!;

export const ADMIN_NAV: { href: string; label: string; icon: IconName }[] = [
  { href: '/admin/dashboard', label: 'نظرة عامة', icon: 'chart' },
  { href: '/admin/dashboard/topics', label: 'المواضيع', icon: 'folder' },
  { href: '/admin/dashboard/suras', label: 'السور', icon: 'book' },
  { href: '/admin/dashboard/ayahs', label: 'الآيات', icon: 'file' },
  { href: '/admin/dashboard/tafsir-books', label: 'كتب التفسير', icon: 'tafsir' },
  { href: '/admin/dashboard/tafsirs', label: 'التفاسير', icon: 'search' },
];

const isActive = (pathname: string, href: string) =>
  href === '/admin/dashboard' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

type Guard = { state: 'checking' } | { state: 'ok'; admin: AdminProfile } | { state: 'error'; offline: boolean };

/**
 * Client-side guard + layout for /admin/dashboard/*. The session cookie belongs to the API
 * origin, so the only reliable check is asking the API (GET /admin/auth/me). Every admin API
 * call is also protected server-side; this guard only decides what to render.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [guard, setGuard] = useState<Guard>({ state: 'checking' });
  const [drawer, setDrawer] = useState(false);
  const redirected = useRef(false);

  const toLogin = useCallback(
    (expired: boolean) => {
      if (redirected.current) return;
      redirected.current = true;
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      router.replace(`/admin/login?${expired ? 'expired=1&' : ''}next=${next}`);
    },
    [router],
  );

  const check = useCallback(() => {
    const ctrl = new AbortController();
    setGuard({ state: 'checking' });
    adminApi
      .me(ctrl.signal)
      .then((admin) => setGuard({ state: 'ok', admin }))
      .catch((err: unknown) => {
        if ((err as Error).name === 'AbortError') return;
        if (err instanceof AdminApiError && err.status === 401) toLogin(false);
        else setGuard({ state: 'error', offline: err instanceof AdminApiError && err.status === 0 });
      });
    return () => ctrl.abort();
  }, [toLogin]);

  useEffect(() => check(), [check]);

  // Any later 401 (session expired mid-use) goes back to the login page.
  useEffect(() => {
    setUnauthorizedHandler(() => toLogin(true));
    return () => setUnauthorizedHandler(null);
  }, [toLogin]);

  useEffect(() => setDrawer(false), [pathname]);

  if (guard.state === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center" data-no-restore>
        <Spinner label="جارٍ التحقق من الجلسة…" />
      </div>
    );
  }
  if (guard.state === 'error') {
    return (
      <div className="mx-auto max-w-md px-4 py-20" data-no-restore>
        <ErrorState
          message={guard.offline ? 'تعذّر الاتصال بالخادم.' : 'تعذّر التحقق من الجلسة.'}
          onRetry={() => check()}
        />
      </div>
    );
  }

  return (
    <AdminContext.Provider value={guard.admin}>
      <ToastProvider>
        <div className="min-h-screen lg:flex" data-no-restore data-testid="admin-shell">
          <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-l border-[var(--border)] bg-[var(--surface)] lg:flex">
            <SidebarContent pathname={pathname} />
          </aside>

          {drawer && (
            <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="القائمة">
              <div className="absolute inset-0 bg-black/60" onClick={() => setDrawer(false)} />
              <aside className="absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col bg-[var(--surface)] shadow-2xl">
                <SidebarContent pathname={pathname} onNavigate={() => setDrawer(false)} />
              </aside>
            </div>
          )}

          <div className="min-w-0 flex-1">
            <AdminHeader admin={guard.admin} onMenu={() => setDrawer(true)} />
            <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6">{children}</main>
          </div>
        </div>
      </ToastProvider>
    </AdminContext.Provider>
  );
}

function SidebarContent({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <>
      <div className="border-b border-[var(--border)] px-5 py-4">
        <p className="text-lg font-bold">لوحة التحكم</p>
        <p className="text-xs text-[var(--muted)]">القرآن الكريم</p>
      </div>
      <nav aria-label="أقسام لوحة التحكم" className="flex-1 space-y-1 overflow-y-auto p-3">
        {ADMIN_NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                active
                  ? 'bg-[var(--badge-blue-bg)] font-semibold text-[var(--badge-blue-fg)]'
                  : 'text-[var(--fg)] hover:bg-[var(--surface-2)]'
              }`}
            >
              <Icon name={item.icon} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-[var(--border)] p-3">
        <Link href="/" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[var(--muted)] hover:bg-[var(--surface-2)]">
          <Icon name="home" />
          العودة للتطبيق
        </Link>
      </div>
    </>
  );
}

function AdminHeader({ admin, onMenu }: { admin: AdminProfile; onMenu: () => void }) {
  const router = useRouter();
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const [menu, setMenu] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [mounted, setMounted] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => setMounted(true), []);
  const dark = mounted && resolvedTheme(theme) === 'dark';

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  const logout = async () => {
    setLeaving(true);
    try {
      await adminApi.logout();
    } catch {
      // The cookie is cleared server-side when reachable; either way leave the dashboard.
    }
    router.replace('/admin/login?logged_out=1');
  };

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onMenu} aria-label="فتح القائمة" className="rounded-xl p-2 hover:bg-[var(--surface-2)] lg:hidden">
            <Icon name="menu" className="h-6 w-6" />
          </button>
          <span className="font-bold lg:hidden">لوحة التحكم</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTheme(dark ? 'light' : 'dark')}
            aria-label={dark ? 'الوضع النهاري' : 'الوضع الليلي'}
            className="rounded-xl p-2 hover:bg-[var(--surface-2)]"
          >
            <Icon name={dark ? 'sun' : 'moon'} />
          </button>
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenu((m) => !m)}
              aria-haspopup="menu"
              aria-expanded={menu}
              data-testid="profile-button"
              className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm hover:border-[var(--accent)]"
            >
              <Icon name="user" />
              <span className="max-w-32 truncate">{admin.name ?? admin.email}</span>
            </button>
            {menu && (
              <div role="menu" className="absolute left-0 mt-2 w-64 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-xl">
                <div className="px-3 py-2">
                  <p className="truncate font-semibold">{admin.name ?? 'المدير'}</p>
                  <p className="truncate text-xs text-[var(--muted)]" dir="ltr">
                    {admin.email}
                  </p>
                  {admin.lastLoginAt && (
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      آخر دخول: {new Date(admin.lastLoginAt).toLocaleString('ar-EG')}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  role="menuitem"
                  onClick={logout}
                  disabled={leaving}
                  data-testid="logout-button"
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-[var(--danger)] hover:bg-[var(--surface-2)] disabled:opacity-50"
                >
                  <Icon name="logout" />
                  {leaving ? 'جارٍ تسجيل الخروج…' : 'تسجيل الخروج'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
