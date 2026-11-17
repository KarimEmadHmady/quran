'use client';

import { useEffect, useId, useRef } from 'react';
import { Icon } from './Icon';
import { TafsirPanel } from './TafsirPanel';

/**
 * Tafsir of one ayah in a popup (used from search results). Centered card on desktop, near
 * full-width on phones; the body scrolls. Closes with the X, a click on the backdrop, or Escape.
 * The tafsir itself comes from TafsirPanel (GET /tafsirs?ayah_id=, confirmed books only).
 */
export function TafsirModal({
  ayahId,
  suraName,
  ayahNumber,
  textUthmani,
  onClose,
}: {
  ayahId: number;
  suraName: string;
  ayahNumber: number;
  textUthmani: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden />
      <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-3">
          <h2 id={titleId} className="text-base font-bold">
            تفسير سورة {suraName} · آية {ayahNumber}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]"
          >
            <Icon name="close" className="h-5 w-5" />
          </button>
        </header>
        <div className="overflow-y-auto px-5 pb-5 pt-3">
          <p className="quran-text text-center">{textUthmani}</p>
          <TafsirPanel ayahId={ayahId} />
        </div>
      </div>
    </div>
  );
}
