'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './Icon';

/** The sections reached from the menu (existing routes; the bottom bar no longer lists them). */
const ENTRIES: { href: string; label: string; icon: IconName }[] = [
  { href: '/surah', label: 'السور', icon: 'book' },
  { href: '/topics', label: 'المواضيع', icon: 'folder' },
  { href: '/adhkar', label: 'الأذكار', icon: 'beads' },
  { href: '/khatma', label: 'الورد اليومي', icon: 'calendar' },
];

const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/**
 * Top bar hamburger (three lines that morph into an X) + a sidebar that slides in from the
 * right (the start side in RTL) over a dimmed overlay. Overlay and sidebar start BELOW the top
 * bar so the animated X stays visible and usable; they are portalled to <body> because the
 * top bar's backdrop-blur would otherwise contain fixed children. Closes on overlay click, Escape, link
 * click and any route change. Focus moves into the panel when it opens and back to the button
 * when it closes; the page behind does not scroll while it is open.
 */
export function MobileMenu() {
  const pathname = usePathname() ?? '/';
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);
  const [mounted, setMounted] = useState(false);
  const [top, setTop] = useState(0);
  useEffect(() => setMounted(true), []);

  const toggle = () => {
    // The top bar is sticky at the top: its bottom edge is where the panel starts.
    const bar = buttonRef.current?.closest('header');
    setTop(Math.max(0, Math.round(bar?.getBoundingClientRect().bottom ?? 0)));
    setOpen((o) => !o);
  };

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
        style={{ top }}
        aria-hidden
        onClick={close}
        className={`fixed inset-x-0 bottom-0 z-40 bg-black/50 transition-opacity duration-300 ${
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
        style={{ top }}
        className={`fixed bottom-0 right-0 z-40 flex w-72 max-w-[85vw] flex-col border-s border-[var(--border)] bg-[var(--surface)] pb-[env(safe-area-inset-bottom)] shadow-2xl transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <nav aria-label="أقسام التطبيق" className="flex-1 overflow-y-auto p-3">
          <ul className="space-y-1">
            {ENTRIES.map((e) => {
              const active = isActive(pathname, e.href);
              return (
                <li key={e.href}>
                  <Link
                    href={e.href}
                    onClick={close}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-3 rounded-xl px-4 py-3 font-semibold transition focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
                      active
                        ? 'bg-[var(--badge-blue-bg)] text-[var(--badge-blue-fg)]'
                        : 'text-[var(--fg)] hover:bg-[var(--surface-2)]'
                    }`}
                  >
                    <Icon name={e.icon} className="h-6 w-6 shrink-0" />
                    <span className="flex-1">{e.label}</span>
                    <Icon name="chevron" className="h-4 w-4 opacity-50" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
          </>,
          document.body,
        )}
    </>
  );
}
