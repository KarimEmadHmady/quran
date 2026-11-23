'use client';

import { useEffect } from 'react';

/** Every card style in the app + `.ui-reveal` (opt-in for custom cards). See globals.css. */
const SELECTOR = '.ui-card, .ui-elevated, .ui-hero, .ui-row, .ui-reveal';
const STAGGER_MS = 110;
const MAX_STAGGER_STEPS = 5;

/**
 * Global scroll reveal. Cards that start BELOW the screen are held hidden
 * (data-reveal="wait") and play the card-rise animation when they scroll into view
 * (data-reveal="in"), staggered when several arrive together. Cards already on screen keep
 * the normal enter animation. New cards (navigation, pagination, sheets) are picked up through
 * a MutationObserver. A data attribute is used, not a class, so React re-renders that rewrite
 * `className` never drop the state. Opt out with `data-no-reveal` on any ancestor.
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
          el.style.setProperty('--reveal-delay', `${Math.min(step, MAX_STAGGER_STEPS) * STAGGER_MS}ms`);
          el.dataset.reveal = 'in';
          step++;
        }
      },
      { rootMargin: '0px 0px -6% 0px', threshold: 0 },
    );

    const seen = new WeakSet<Element>();
    let pending: Element[] = [];
    let frame = 0;

    // Measure in one animation frame instead of once per added node.
    const flush = () => {
      frame = 0;
      const batch = pending;
      pending = [];
      const viewportBottom = window.innerHeight;
      for (const el of batch) {
        if (!el.isConnected || el.closest('[data-no-reveal]')) continue;
        if (el.getBoundingClientRect().top < viewportBottom) continue; // visible now
        (el as HTMLElement).dataset.reveal = 'wait';
        io.observe(el);
      }
    };

    const collect = (root: Element) => {
      const add = (el: Element) => {
        if (seen.has(el)) return;
        seen.add(el);
        pending.push(el);
      };
      if (root.matches(SELECTOR)) add(root);
      root.querySelectorAll(SELECTOR).forEach(add);
      if (pending.length > 0 && frame === 0) frame = requestAnimationFrame(flush);
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

    return () => {
      mo.disconnect();
      io.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
