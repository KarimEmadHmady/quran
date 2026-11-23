'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAudioStore } from '@/store/useAudioStore';
import { useCartStore } from '@/store/useCartStore';
import { useUiStore } from '@/store/useUiStore';
import { Icon, type IconName } from './Icon';
import { MobileMenu } from './MobileMenu';
import { SettingsButton } from './ReadingSettingsPanel';

/** The admin dashboard (/admin/*) has its own layout: the reader chrome is not rendered there. */
export const isAdminPath = (pathname: string | null) => pathname === '/admin' || !!pathname?.startsWith('/admin/');

/** The reader's page frame; the admin dashboard gets the full width instead. */
export function MainFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (isAdminPath(pathname)) return <>{children}</>;
  // Extra bottom room while the audio player bar is shown (--player-h, set by AudioPlayerBar).
  return (
    <main
      className="mx-auto max-w-2xl px-4 pt-4"
      style={{ paddingBottom: 'var(--frame-pb)' }}
    >
      {children}
    </main>
  );
}

/**
 * Design top bar: a deep green header with rounded bottom corners and a faint mosque on its left (/logo-opacity.png).
 * Right side (RTL): the logo in a white circle + the app name and tagline; left side: the menu
 * button and the settings gear (gold, see .topbar-actions in globals.css).
 */
export function TopBar() {
  const pathname = usePathname();
  if (isAdminPath(pathname)) return null;
  return (
    <header className="sticky top-0 z-30 overflow-hidden rounded-b-[1.75rem] border-b border-transparent bg-[var(--brand)] text-[var(--brand-fg)] shadow-[0_6px_20px_rgb(23_88_74/0.18)] backdrop-blur">
      {/* eslint-disable-next-line @next/next/no-img-element -- decorative static image */}
      <img
        src="/logo-opacity.png"
        alt=""
        aria-hidden
        className="pointer-events-none absolute -bottom-2 left-0 h-[165%] w-auto select-none opacity-60"
      />
      <div className="relative mx-auto flex h-[var(--topbar-h)] max-w-2xl items-center justify-between px-4">
        <Link href="/" className="flex min-w-0 items-center gap-3">
          {/* First child = right side in RTL. */}
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white p-1 shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element -- small static logo */}
            <img src="/logo-mark.png" alt="" aria-hidden width={40} height={40} className="h-full w-full object-contain" />
          </span>
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-lg font-bold">القرآن الكريم</span>
            <span className="truncate text-[0.7rem] text-[var(--brand-gold)]">معا نحو اتقان القرآن الكريم</span>
          </span>
        </Link>
        <div className="topbar-actions flex items-center gap-1">
          <MobileMenu />
          <SettingsButton />
        </div>
      </div>
    </header>
  );
}

const NAV_ICON = 'h-5 w-5';

const TABS: { href: string; label: string; icon: IconName; match: (p: string) => boolean }[] = [
  { href: '/', label: 'الرئيسية', icon: 'home', match: (p) => p === '/' },
  { href: '/search', label: 'البحث', icon: 'search', match: (p) => p.startsWith('/search') },
];

/**
 * Bottom tab bar: exactly 4 equal-width items (RTL order): home, cart (opens the cart sheet),
 * search, player (toggles the audio player). Settings live in the top bar (gear), and surahs /
 * topics / adhkar / daily wird in the top bar menu (MobileMenu).
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

  // Design: the active tab is a filled green pill inside the floating bar.
  const item = (active: boolean) =>
    `flex min-w-0 flex-1 basis-0 flex-col items-center justify-center gap-0.5 whitespace-nowrap rounded-full py-1.5 text-[0.72rem] leading-tight transition focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
      active ? 'bg-[var(--primary-bg)] font-semibold text-[var(--primary-fg)]' : 'text-[var(--muted)] hover:text-[var(--fg)]'
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
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-[calc(0.625rem+env(safe-area-inset-bottom))]"
    >
      <div className="pointer-events-auto mx-auto flex h-[3.75rem] max-w-md items-stretch gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)]/95 p-1.5 shadow-[0_8px_28px_rgb(0_0_0/0.12)] backdrop-blur">
        {tab(TABS[0])}
        <button
          type="button"
          onClick={() => open('cart')}
          className={item(sheet === 'cart' || pathname === '/cart')}
          aria-label={`مختاراتي: ${mounted ? count : 0} آية`}
        >
          <span className="relative">
            <Icon name="cart" className={NAV_ICON} />
            {mounted && count > 0 && (
              <span className="absolute -left-2 -top-1 min-w-4 rounded-full bg-[var(--accent)] px-1 text-[0.6rem] leading-4 text-white">
                {count}
              </span>
            )}
          </span>
          مختاراتي
        </button>
        {tab(TABS[1])}
        <button
          type="button"
          onClick={() => setPlayerOpen(!playerOpen)}
          className={item(playerOpen)}
          aria-expanded={playerOpen}
          aria-label={audioSaved ? 'التشغيل (يوجد استماع محفوظ)' : 'التشغيل'}
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
          التشغيل
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
