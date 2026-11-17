'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { STORAGE_KEYS, getItem, setItem } from '@/lib/localStore';
import { isAdminPath } from './AppChrome';
import { parseLastRoute, type LastRoute } from '@/lib/shapes';
import { useBookmarkStore } from '@/store/useBookmarkStore';
import { useAudioStore } from '@/store/useAudioStore';
import { useKhatmaStore } from '@/store/useKhatmaStore';
import { resolvedTheme, useSettingsStore } from '@/store/useSettingsStore';

/** Pages never restored as "last page" (nothing to resume there). */
const NOT_RESTORED = new Set(['/']);
const SCROLL_SAVE_DEBOUNCE_MS = 500;

/**
 * App-wide client wiring: hydrates the localStorage stores once, applies the reading settings
 * to <html> immediately (spec 4.2), and records / restores the last page (spec 4.8).
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const theme = useSettingsStore((s) => s.theme);
  const fontSize = useSettingsStore((s) => s.fontSize);
  const hydrated = useSettingsStore((s) => s.hydrated);
  const firstPath = useRef<string | null>(null);
  const pendingScroll = useRef<{ path: string; y: number } | null>(null);

  // Hydrate every store once (after mount: no server/client mismatch).
  useEffect(() => {
    useSettingsStore.getState().hydrate();
    useBookmarkStore.getState().hydrate();
    useKhatmaStore.getState().hydrate();
    useAudioStore.getState().hydrate();
  }, []);

  // Theme: the saved choice, or the device preference (followed live until a choice is saved).
  useEffect(() => {
    if (!hydrated) return; // the boot script already applied the saved values
    const root = document.documentElement;
    const apply = () => {
      const t = resolvedTheme(theme);
      root.classList.toggle('dark', t === 'dark');
      root.style.colorScheme = t;
    };
    apply();
    if (theme !== null || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme, hydrated]);

  useEffect(() => {
    if (hydrated) document.documentElement.style.setProperty('--quran-size', `${fontSize}px`);
  }, [fontSize, hydrated]);

  // spec 4.8: on the very first page of this visit, "/" goes back to the last page.
  useEffect(() => {
    if (firstPath.current !== null) return;
    firstPath.current = pathname;
    if (pathname !== '/') return;
    const last = parseLastRoute(getItem<unknown>(STORAGE_KEYS.lastRoute, null));
    if (!last || NOT_RESTORED.has(last.path.split(/[?#]/)[0]) || isAdminPath(last.path.split(/[?#]/)[0])) return;
    pendingScroll.current = last.path.includes('#') ? null : { path: last.path.split('?')[0], y: last.scrollY };
    router.replace(last.path);
  }, [pathname, router]);

  // Record the current page and its scroll position.
  useEffect(() => {
    const record = () => {
      // Error / 404 pages carry data-no-restore: never reopen the app on a broken page.
      if (document.querySelector('[data-no-restore]')) return;
      // The admin dashboard is never the reader's "last page".
      if (isAdminPath(window.location.pathname)) return;
      const value: LastRoute = {
        path: window.location.pathname + window.location.search,
        scrollY: Math.max(0, Math.round(window.scrollY)),
        updatedAt: new Date().toISOString(),
      };
      if (parseLastRoute(value)) setItem(STORAGE_KEYS.lastRoute, value);
    };
    const pending = pendingScroll.current;
    if (pending && pending.path === pathname) {
      pendingScroll.current = null;
      requestAnimationFrame(() => window.scrollTo(0, pending.y));
    }
    // After paint, so the page (or its error / 404 state) is in the DOM.
    const first = pathname !== '/' ? requestAnimationFrame(() => record()) : 0;
    let t: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      clearTimeout(t);
      t = setTimeout(() => window.location.pathname !== '/' && record(), SCROLL_SAVE_DEBOUNCE_MS);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(first);
      clearTimeout(t);
      window.removeEventListener('scroll', onScroll);
    };
  }, [pathname]);

  return <>{children}</>;
}
