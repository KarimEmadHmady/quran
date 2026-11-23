'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './Icon';

/** The sections reached from the menu (existing routes; the bottom bar no longer lists them). */
const ENTRIES: { href: string; label: string; hint: string; icon: IconName; tile: string }[] = [
  { href: '/surah', label: 'السور', hint: 'تصفح سور القرآن الكريم', icon: 'book', tile: 'mint' },
  { href: '/topics', label: 'المواضيع', hint: 'آيات مصنفة حسب الموضوع', icon: 'folder', tile: 'sand' },
  { href: '/adhkar', label: 'الأذكار', hint: 'حصن المسلم', icon: 'beads', tile: 'gray' },
  { href: '/khatma', label: 'الورد اليومي', hint: 'تابع ختمتك يوميا', icon: 'calendar', tile: 'mint' },
];

const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/**
 * Top bar hamburger + a full-height sidebar that slides in from the right (the start side in
 * RTL) over a dimmed overlay. Both cover the whole screen, top bar included, so the sidebar has
 * its own X button. They are portalled to <body> because the top bar's backdrop-blur would
 * otherwise contain fixed children. Closes on the X, overlay click, Escape, link click and any
 * route change. Focus moves into the panel when it opens and back to the button
 * when it closes; the page behind does not scroll while it is open.
 */
export function MobileMenu() {
  const pathname = usePathname() ?? '/';
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const toggle = () => setOpen((o) => !o);

  const close = useCallback(() => setOpen(false), []);

  // Any navigation closes it (also covers back / forward).
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) {
      if (wasOpen.current) buttonRef.current?.focus();
      wasOpen.current = false;
      return;
    }
    wasOpen.current = true;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        return;
      }
      // Keep Tab inside the panel while it is open.
      if (e.key !== 'Tab' || !panelRef.current) return;
      const items = panelRef.current.querySelectorAll<HTMLElement>('a, button');
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = setTimeout(() => panelRef.current?.querySelector<HTMLElement>('a')?.focus(), 50);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      clearTimeout(t);
    };
  }, [open]);

  const line = 'absolute right-0 h-0.5 w-5 rounded-full bg-current transition-all duration-300 ease-out';

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-label={open ? 'إغلاق القائمة' : 'فتح القائمة'}
        aria-expanded={open}
        aria-controls="app-menu"
        className="relative rounded-full p-2 text-[var(--fg)] transition hover:bg-[var(--surface-2)] focus-visible:outline-2 focus-visible:outline-[var(--accent)] active:scale-90"
      >
        <span aria-hidden className="relative block h-6 w-6">
          <span className="absolute inset-0 m-auto block h-4 w-5">
            <span className={`${line} ${open ? 'top-[7px] rotate-45' : 'top-0'}`} />
            <span className={`${line} top-[7px] ${open ? 'scale-x-0 opacity-0' : 'opacity-100'}`} />
            <span className={`${line} ${open ? 'top-[7px] -rotate-45' : 'top-[14px]'}`} />
          </span>
        </span>
      </button>

      {mounted &&
        createPortal(
          <>
      {/* Overlay */}
      <div
        aria-hidden
        onClick={close}
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      {/* Sidebar (kept mounted so it can animate; inert + hidden from AT while closed) */}
      <div
        id="app-menu"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="القائمة"
        aria-hidden={!open}
        inert={!open}
        className={`fixed inset-y-0 right-0 z-40 flex w-80 max-w-[85vw] flex-col overflow-hidden rounded-l-3xl border-s border-[var(--border)] bg-[var(--surface)] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] shadow-2xl transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex shrink-0 items-center justify-between px-5 pb-1 pt-4">
          <span className="text-lg font-bold text-[var(--fg)]">القائمة</span>
          <button
            type="button"
            onClick={close}
            aria-label="إغلاق القائمة"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--fg)] transition hover:bg-[var(--border)] focus-visible:outline-2 focus-visible:outline-[var(--accent)] active:scale-90"
          >
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>

        <nav aria-label="أقسام التطبيق" className="flex-1 overflow-y-auto px-3 py-3">
          <p className="mb-2 px-2 text-xs font-semibold text-[var(--muted)]">الأقسام</p>
          <ul className="space-y-1.5">
            {ENTRIES.map((e) => {
              const active = isActive(pathname, e.href);
              return (
                <li key={e.href}>
                  <Link
                    href={e.href}
                    onClick={close}
                    aria-current={active ? 'page' : undefined}
                    className={`group relative flex items-center gap-3 rounded-2xl border px-3 py-2.5 transition focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
                      active
                        ? 'border-[var(--accent)]/40 bg-[var(--tile-mint)]'
                        : 'border-transparent hover:border-[var(--border)] hover:bg-[var(--surface-2)]'
                    }`}
                  >
                    {active && (
                      <span aria-hidden className="absolute inset-y-3 right-0 w-1 rounded-full bg-[var(--accent)]" />
                    )}
                    <span
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--accent)] transition group-hover:scale-105"
                      style={{ background: `var(--tile-${e.tile}-icon)` }}
                    >
                      <Icon name={e.icon} className="h-5 w-5" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col leading-tight">
                      <span className={`font-semibold ${active ? 'text-[var(--accent)]' : 'text-[var(--fg)]'}`}>
                        {e.label}
                      </span>
                      <span className="mt-0.5 truncate text-xs text-[var(--muted)]">{e.hint}</span>
                    </span>
                    <Icon
                      name="chevron"
                      className={`h-4 w-4 shrink-0 transition group-hover:-translate-x-0.5 ${active ? 'text-[var(--accent)]' : 'opacity-40'}`}
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Brand block at the bottom: faded mosque logo over the brand green. */}
        <div className="relative h-44 shrink-0 overflow-hidden rounded-t-3xl rounded-bl-3xl bg-[var(--brand)] px-5 pt-6 text-[var(--brand-fg)] shadow-[0_-4px_12px_rgba(0,0,0,0.08)]">
          {/* eslint-disable-next-line @next/next/no-img-element -- small static decorative image */}
          <img
            src="/logo-opacity.png"
            alt=""
            aria-hidden
            className="pointer-events-none absolute -bottom-3 left-1/2 w-56 max-w-none -translate-x-1/2 select-none"
          />
          <div className="relative flex flex-col items-center text-center">
            <span className="text-xl font-bold">القرآن الكريم</span>
            <span className="mt-1 text-xs text-[var(--brand-gold)]">معا نحو اتقان القرآن الكريم</span>
          </div>
        </div>
      </div>
          </>,
          document.body,
        )}
    </>
  );
}
