'use client';

import { useEffect } from 'react';

/** Every card style in the app + `.ui-reveal` (opt-in for custom cards). See globals.css. */
const SELECTOR = '.ui-card, .ui-elevated, .ui-hero, .ui-row, .ui-reveal';
const STAGGER_MS = 110;
const MAX_STAGGER_STEPS = 5;

/**
 * Global scroll reveal. Cards that start BELOW the screen are held hidden
 * (data-reveal="wait") and play the card-rise animation when they come into view
 * (data-reveal="in"), staggered when several arrive together. Cards already on screen keep
 * the normal enter animation. New cards (navigation, pagination, sheets) are picked up through
 * a MutationObserver. A data attribute is used, not a class, so React re-renders that rewrite
 * `className` never drop the state. Opt out with `data-no-reveal` on any ancestor.
 *
 * Two triggers:
 *  - IntersectionObserver: a card entering the viewport (by scrolling, or a sheet sliding in).
 *  - A scroll check for cards that were SKIPPED: a fast fling, a scrollbar drag or a jump
 *    (#ayah, scroll restore, scroll-to-top) can carry a card from below the screen to above it
 *    without it ever intersecting; it is then shown instantly (data-reveal="done"), otherwise it
 *    would stay invisible when the user scrolls back up. Waiting cards are kept in document
 *    order, so each frame measures only until the first one that is not above the screen.
 *
 * Does nothing when the user prefers reduced motion.
 */
export function ScrollReveal() {
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined' || typeof MutationObserver === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const io = new IntersectionObserver(
      (entries) => {
        let step = 0;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          io.unobserve(el);
          if (el.dataset.reveal !== 'wait') continue;
          el.style.setProperty('--reveal-delay', `${Math.min(step, MAX_STAGGER_STEPS) * STAGGER_MS}ms`);
          el.dataset.reveal = 'in';
          step++;
        }
      },
      { rootMargin: '0px 0px -6% 0px', threshold: 0 },
    );

    const seen = new WeakSet<Element>();
    let pending: Element[] = []; // collected, not measured yet
    let waiting: HTMLElement[] = []; // hidden, in document order
    let frame = 0;

    const byDocumentOrder = (a: Node, b: Node) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;

    /** Show (without animation) every waiting card that is already above the screen. */
    const showSkipped = () => {
      const passed: HTMLElement[] = [];
      let i = 0;
      for (; i < waiting.length; i++) {
        const el = waiting[i];
        if (!el.isConnected || el.dataset.reveal !== 'wait') continue; // gone, or revealed by IO
        if (el.getBoundingClientRect().bottom > 0) break; // first card not above: stop
        passed.push(el);
      }
      if (i === 0) return;
      for (const el of passed) {
        io.unobserve(el);
        el.dataset.reveal = 'done';
      }
      waiting = waiting.slice(i);
    };

    const tick = () => {
      frame = 0;
      if (pending.length > 0) {
        const batch = pending;
        pending = [];
        const viewportBottom = window.innerHeight;
        // Measure every new card first, THEN write (writing between reads forced a layout per card).
        const below = batch.filter(
          (el) => el.isConnected && !el.closest('[data-no-reveal]') && el.getBoundingClientRect().top >= viewportBottom,
        ) as HTMLElement[];
        for (const el of below) {
          el.dataset.reveal = 'wait';
          io.observe(el);
        }
        if (below.length > 0) waiting = [...waiting, ...below].sort(byDocumentOrder);
      }
      showSkipped();
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(tick);
    };

    const collect = (root: Element) => {
      const add = (el: Element) => {
        if (seen.has(el)) return;
        seen.add(el);
        pending.push(el);
      };
      if (root.matches(SELECTOR)) add(root);
      root.querySelectorAll(SELECTOR).forEach(add);
      if (pending.length > 0) schedule();
    };

    collect(document.body);
    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((n) => {
          if (n instanceof Element) collect(n);
        });
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('scroll', schedule, { passive: true });

    return () => {
      mo.disconnect();
      io.disconnect();
      window.removeEventListener('scroll', schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
