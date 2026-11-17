'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useCartStore } from '@/store/useCartStore';
import { useUiStore } from '@/store/useUiStore';
import { Icon, type IconName } from './Icon';
import { SettingsButton } from './ReadingSettingsPanel';

/** The admin dashboard (/admin/*) has its own layout: the reader chrome is not rendered there. */
export const isAdminPath = (pathname: string | null) => pathname === '/admin' || !!pathname?.startsWith('/admin/');

/** The reader's page frame; the admin dashboard gets the full width instead. */
export function MainFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (isAdminPath(pathname)) return <>{children}</>;
  return <main className="mx-auto max-w-2xl px-4 pb-28 pt-5">{children}</main>;
}

/** Design top bar: the app name, and the settings gear. */
export function TopBar() {
  const pathname = usePathname();
  if (isAdminPath(pathname)) return null;
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-xl font-bold">
          القرآن الكريم
        </Link>
        <SettingsButton />
      </div>
    </header>
  );
}

const TABS: { href: string; label: string; icon: IconName; match: (p: string) => boolean }[] = [
  { href: '/', label: 'الرئيسية', icon: 'home', match: (p) => p === '/' },
  { href: '/surah', label: 'السور', icon: 'book', match: (p) => p.startsWith('/surah') },
  { href: '/search', label: 'البحث', icon: 'search', match: (p) => p.startsWith('/search') },
];

/**
 * Design bottom tab bar: home, surahs, cart (opens the cart sheet), search, settings (opens the
 * settings sheet). Topics and khatma are on the home screen tiles.
 */
export function BottomNav() {
  const pathname = usePathname();
  const open = useUiStore((s) => s.open);
  const sheet = useUiStore((s) => s.sheet);
  const count = useCartStore((s) => s.items.length);
  const [mounted, setMounted] = useState(false); // the cart count comes from localStorage
  useEffect(() => setMounted(true), []);
  if (isAdminPath(pathname)) return null;

  const item = (active: boolean) =>
    `flex flex-1 flex-col items-center gap-1 py-2 text-[0.7rem] transition ${
      active ? 'text-[var(--accent)]' : 'text-[var(--muted)] hover:text-[var(--fg)]'
    }`;
  const tab = (t: (typeof TABS)[number]) => (
    <Link key={t.href} href={t.href} className={item(t.match(pathname))} aria-current={t.match(pathname) ? 'page' : undefined}>
      <Icon name={t.icon} className="h-6 w-6" />
      {t.label}
    </Link>
  );

  return (
    <nav
      aria-label="التنقل الرئيسي"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur"
    >
      <div className="mx-auto flex max-w-2xl items-stretch px-2 pb-[env(safe-area-inset-bottom)]">
        {tab(TABS[0])}
        {tab(TABS[1])}
        <button
          type="button"
          onClick={() => open('cart')}
          className={item(sheet === 'cart' || pathname === '/cart')}
          aria-label={`السلة: ${mounted ? count : 0} آية`}
        >
          <span className="relative">
            <Icon name="cart" className="h-6 w-6" />
            {mounted && count > 0 && (
              <span className="absolute -left-2 -top-1 min-w-4 rounded-full bg-[var(--accent)] px-1 text-[0.6rem] leading-4 text-white">
                {count}
              </span>
            )}
          </span>
          السلة
        </button>
        {tab(TABS[2])}
        <button type="button" onClick={() => open('settings')} className={item(sheet === 'settings')}>
          <Icon name="settings" className="h-6 w-6" />
          الإعدادات
        </button>
      </div>
    </nav>
  );
}

/** Design page header: "→ Title" (the arrow goes back to `backHref`, home by default). */
export function PageHeader({
  title,
  backHref = '/',
  backLabel = 'الرئيسية',
  children,
}: {
  title: string;
  backHref?: string;
  backLabel?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="mb-4 flex items-center gap-3">
      <Link href={backHref} aria-label={backLabel} className="rounded-full p-1 text-[var(--fg)] hover:bg-[var(--surface-2)]">
        <Icon name="back" className="h-6 w-6" />
      </Link>
      <h1 className="text-xl font-bold">{title}</h1>
      {children}
    </header>
  );
}
