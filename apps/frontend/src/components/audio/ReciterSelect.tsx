'use client';

import { useEffect, useId } from 'react';
import { useAudioStore } from '@/store/useAudioStore';

/**
 * Reciter picker (Arabic names). The choice is saved in `quran_audio` and applies immediately
 * (switching while listening restarts the same ayah with the new reciter).
 * `inline` = label beside the list (sura page); default = label above it (settings, player).
 */
export function ReciterSelect({
  className = '',
  inline = false,
  label = 'القارئ',
  compact = false,
}: {
  className?: string;
  inline?: boolean;
  label?: string;
  /** Smaller label and list (the sura page's compact audio menu). */
  compact?: boolean;
}) {
  const id = useId();
  const reciters = useAudioStore((s) => s.reciters);
  const loadReciters = useAudioStore((s) => s.loadReciters);
  const setReciter = useAudioStore((s) => s.setReciter);
  const selected = useAudioStore((s) => s.reciterId());

  useEffect(() => {
    void loadReciters();
  }, [loadReciters]);

  return (
    <div className={`${compact ? 'text-xs' : 'text-sm'} ${inline ? (compact ? 'flex items-center gap-1.5' : 'flex items-center gap-3') : compact ? 'space-y-1' : 'space-y-2'} ${className}`}>
      <label htmlFor={id} className={inline ? (compact ? 'shrink-0 text-[var(--muted)]' : 'shrink-0 font-semibold') : compact ? 'block text-[var(--muted)]' : 'block'}>
        {label}
      </label>
      {reciters.state === 'error' ? (
        <p className="flex items-center justify-between gap-2 text-[var(--danger)]" role="alert">
          {reciters.message}
          <button type="button" className="ui-chip" onClick={() => void loadReciters(true)}>
            إعادة المحاولة
          </button>
        </p>
      ) : reciters.state === 'ready' && reciters.data.length === 0 ? (
        <p className="text-[var(--muted)]">لا يوجد قرّاء متاحون حالياً.</p>
      ) : (
        <select
          id={id}
          className={`ui-input ${compact ? 'px-2 py-1 text-xs' : 'px-3 py-2.5'} ${inline ? 'min-w-0 flex-1' : 'w-full'}`}
          disabled={reciters.state !== 'ready'}
          value={selected ?? ''}
          onChange={(e) => setReciter(e.target.value)}
        >
          {reciters.state !== 'ready' ? (
            <option value="">جارٍ تحميل القرّاء…</option>
          ) : (
            reciters.data.map((r) => (
              <option key={r.identifier} value={r.identifier}>
                {r.name}
                {r.englishName ? ` — ${r.englishName}` : ''}
              </option>
            ))
          )}
        </select>
      )}
    </div>
  );
}
