'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { isAdminPath } from './AppChrome';
import { Icon } from './Icon';

const SHOW_AFTER_PX = 400;

/** Floating "back to top" button, shown once the page is scrolled down. */
export function ScrollToTop() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > SHOW_AFTER_PX);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [pathname]);

  if (!visible) return null;
  // Above the reader's bottom tab bar; the admin dashboard has no tab bar.
  // In the reader, also above the audio player bar when it is shown (--player-h).
  const bottom = isAdminPath(pathname) ? '1.5rem' : 'calc(6rem + var(--player-h, 0px))';
  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="الرجوع لأعلى الصفحة"
      title="لأعلى"
      style={{ bottom }}
      className={`fixed left-4 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--fg)] shadow-lg transition hover:border-[var(--accent)] hover:text-[var(--accent)]`}
    >
      <Icon name="up" className="h-5 w-5" />
    </button>
  );
}
