'use client';

import { useEffect, type RefObject } from 'react';
import { useKhatmaStore } from '@/store/useKhatmaStore';

/** An ayah counts as read once its bottom edge has scrolled above this line (share of the viewport height). */
const READ_LINE = 0.35;
/** "Scrolled to the very end" tolerance (px). */
const END_SLACK = 4;

/**
 * Automatic «تمت القراءة» while reading (daily wird): as the user scrolls DOWN, the next unread
 * ayah of the khatma becomes read once its bottom edge passes the reading line (35% from the top
 * of the screen), then the next one, and so on. At the very end of the page, the remaining ayahs
 * that are fully on screen count too (they can never reach the line).
 *
 * Safety:
 *  - only real user scrolling counts (wheel / touch / keys / scrollbar drag): opening the page,
 *    the app's own scroll restore or a #ayah jump never marks anything;
 *  - marking is contiguous from the khatma position (lastAyahId + 1, + 2, …) and stops at the
 *    first ayah not passed, so ayahs the user never reached (or that are not on this page) are
 *    never marked; each ayah is marked once (markRead ignores already-read ayahs);
 *  - cheap: one rAF-throttled check per scroll frame that measures only the next unread ayah(s).
 * Progress is saved through the khatma store (`quran_khatma`), like the manual button.
 */
export function useAutoKhatmaReading(
  listRef: RefObject<HTMLElement | null>,
  ayahIds: readonly number[],
  enabled: boolean,
  /** Re-attach when the layout changes (vertical / mushaf). */
  layoutKey: string,
): void {
  const active = useKhatmaStore((s) => s.khatma !== null);

  useEffect(() => {
    if (!enabled || !active || typeof window === 'undefined') return;
    const ids = new Set(ayahIds);
    let userScrolling = false;
    let frame = 0;

    const check = () => {
      frame = 0;
      const list = listRef.current;
      if (!userScrolling || !list) return;
      const store = useKhatmaStore.getState();
      const k = store.khatma;
      if (!k) return;
      const vh = window.innerHeight;
      const line = vh * READ_LINE;
      const atEnd = window.scrollY + vh >= document.documentElement.scrollHeight - END_SLACK;
      let last = k.lastAyahId;
      while (ids.has(last + 1)) {
        const el = list.querySelector<HTMLElement>(`[data-ayah-id="${last + 1}"]`);
        if (!el) break;
        const r = el.getBoundingClientRect();
        if (r.bottom <= line || (atEnd && r.bottom <= vh && r.top >= 0)) last++;
        else break;
      }
      if (last > k.lastAyahId) store.markRead(last);
    };

    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const down = y > lastY;
      lastY = y;
      if (down && !frame) frame = requestAnimationFrame(check);
    };
    const onUser = () => {
      userScrolling = true;
    };
    // A press on the page's own scrollbar targets the root element (a tap on content does not).
    const onPointer = (e: PointerEvent) => {
      if (e.target === document.documentElement) userScrolling = true;
    };
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowDown', 'PageDown', 'End', ' ', 'Spacebar'].includes(e.key)) userScrolling = true;
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('wheel', onUser, { passive: true });
    window.addEventListener('touchmove', onUser, { passive: true });
    window.addEventListener('pointerdown', onPointer, { passive: true }); // scrollbar drag
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('wheel', onUser);
      window.removeEventListener('touchmove', onUser);
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [enabled, active, ayahIds, listRef, layoutKey]);
}
