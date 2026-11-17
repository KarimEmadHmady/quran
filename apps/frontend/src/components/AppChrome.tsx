'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAudioStore } from '@/store/useAudioStore';
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
  // Extra bottom room while the audio player bar is shown (--player-h, set by AudioPlayerBar).
  return (
    <main className="mx-auto max-w-2xl px-4 pt-5" style={{ paddingBottom: 'calc(7rem + var(--player-h, 0px))' }}>
      {children}
    </main>
  );
}

/** Design top bar: the app name, and the settings gear. */
export function TopBar() {
  const pathname = usePathname();
  if (isAdminPath(pathname)) return null;
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-xl font-bold">
          {/* app/icon.svg (served by Next.js at /icon.svg). First child = right side in RTL. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- tiny static SVG, no optimization needed */}
          <img src="/icon.svg" alt="" aria-hidden width={26} height={26} className="h-[26px] w-[26px] shrink-0" />
          القرآن الكريم
        </Link>
        <SettingsButton />
      </div>
    </header>
  );
}

/** Nav icon size: compact on phones (7 items must fit), original size from sm up. */
const NAV_ICON = 'h-5 w-5 sm:h-6 sm:w-6';

const TABS: { href: string; label: string; icon: IconName; match: (p: string) => boolean }[] = [
  { href: '/', label: 'الرئيسية', icon: 'home', match: (p) => p === '/' },
  { href: '/surah', label: 'السور', icon: 'book', match: (p) => p.startsWith('/surah') },
  { href: '/topics', label: 'المواضيع', icon: 'folder', match: (p) => p.startsWith('/topics') },
  { href: '/search', label: 'البحث', icon: 'search', match: (p) => p.startsWith('/search') },
];

/**
 * Design bottom tab bar (7 items, RTL order): home, surahs, topics, cart (opens the cart sheet),
 * search, audio player, settings (opens the settings sheet). Khatma is on the home screen tiles.
 * On phones (< sm) icons, labels and padding shrink so all 7 fit the width without scrolling;
 * from sm up it keeps the original sizes.
 */
export function BottomNav() {
  const pathname = usePathname();
  const open = useUiStore((s) => s.open);
  const sheet = useUiStore((s) => s.sheet);
  const count = useCartStore((s) => s.items.length);
  // Audio player: open state, and whether there is something to resume (playing, paused, or saved).
  const playerOpen = useAudioStore((s) => s.playerOpen);
  const setPlayerOpen = useAudioStore((s) => s.setPlayerOpen);
  const audioPlaying = useAudioStore((s) => s.status === 'playing' || s.status === 'buffering');
  const audioSaved = useAudioStore((s) => s.status !== 'idle' || s.restored !== null);
  const [mounted, setMounted] = useState(false); // the cart count comes from localStorage
  useEffect(() => setMounted(true), []);
  if (isAdminPath(pathname)) return null;

  const item = (active: boolean) =>
    `flex min-w-0 flex-1 flex-col items-center gap-0.5 whitespace-nowrap px-0.5 py-1.5 text-[0.6rem] leading-tight transition sm:gap-1 sm:px-0 sm:py-2 sm:text-[0.7rem] ${
      active ? 'text-[var(--accent)]' : 'text-[var(--muted)] hover:text-[var(--fg)]'
    }`;
  const tab = (t: (typeof TABS)[number]) => (
    <Link key={t.href} href={t.href} className={item(t.match(pathname))} aria-current={t.match(pathname) ? 'page' : undefined}>
      <Icon name={t.icon} className={NAV_ICON} />
      {t.label}
    </Link>
  );

  return (
    <nav
      aria-label="التنقل الرئيسي"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur"
    >
      <div className="mx-auto flex max-w-2xl items-stretch px-0.5 pb-[env(safe-area-inset-bottom)] sm:px-2">
        {tab(TABS[0])}
        {tab(TABS[1])}
        {tab(TABS[2])}
        <button
          type="button"
          onClick={() => open('cart')}
          className={item(sheet === 'cart' || pathname === '/cart')}
          aria-label={`السلة: ${mounted ? count : 0} آية`}
        >
          <span className="relative">
            <Icon name="cart" className={NAV_ICON} />
            {mounted && count > 0 && (
              <span className="absolute -left-2 -top-1 min-w-4 rounded-full bg-[var(--accent)] px-1 text-[0.6rem] leading-4 text-white">
                {count}
              </span>
            )}
          </span>
          السلة
        </button>
        {tab(TABS[3])}
        <button
          type="button"
          onClick={() => setPlayerOpen(!playerOpen)}
          className={item(playerOpen)}
          aria-expanded={playerOpen}
          aria-label={audioSaved ? 'المشغّل (يوجد استماع محفوظ)' : 'المشغّل'}
        >
          <span className="relative">
            <Icon name="headphones" className={NAV_ICON} />
            {audioSaved && (
              <span
                aria-hidden
                className={`absolute -left-1 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--surface)] bg-[var(--accent)] ${
                  audioPlaying ? 'animate-pulse' : ''
                }`}
              />
            )}
          </span>
          المشغّل
        </button>
        <button type="button" onClick={() => open('settings')} className={item(sheet === 'settings')}>
          <Icon name="settings" className={NAV_ICON} />
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
