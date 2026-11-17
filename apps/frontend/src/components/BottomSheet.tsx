'use client';

import { useEffect } from 'react';
import { Icon } from './Icon';

/** The design's bottom sheet: dimmed backdrop, rounded top, drag handle. Esc / backdrop close it. */
export function BottomSheet({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={label}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[85vh] w-full max-w-xl flex-col rounded-t-3xl border border-b-0 border-[var(--border)] bg-[var(--surface)] shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق"
          className="absolute left-3 top-3 z-10 rounded-full p-2 text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]"
        >
          <Icon name="close" />
        </button>
        <div className="flex justify-center pb-1 pt-3">
          <span className="h-1.5 w-12 rounded-full bg-[var(--border)]" aria-hidden />
        </div>
        <div className="overflow-y-auto px-5 pb-6">{children}</div>
      </div>
    </div>
  );
}
