'use client';

import { useEffect, useId } from 'react';
import { surahReciterLabel, useAudioStore } from '@/store/useAudioStore';

const UNSUPPORTED_NOTE =
  'قارئ الآيات المختار لا يتوفر له تسجيل كامل للسور، فاخترنا قارئاً متاحاً. يمكنك تغييره من القائمة.';

/**
 * Full-sura reciter picker (Mode B). It lists ONLY reciters that have one-MP3-per-sura
 * recordings (a separate list from the ayah reciters), so an invalid choice is impossible.
 * When the selected ayah reciter has no full-sura recordings, it says so and shows the
 * reciter actually used.
 */
export function SurahReciterSelect({
  className = '',
  inline = false,
  compact = false,
  label = 'قارئ السورة كاملة',
}: {
  className?: string;
  inline?: boolean;
  /** Smaller label and list (the sura page's compact audio menu). */
  compact?: boolean;
  label?: string;
}) {
  const id = useId();
  const list = useAudioStore((s) => s.surahReciters);
  const load = useAudioStore((s) => s.loadSurahReciters);
  const loadAyahReciters = useAudioStore((s) => s.loadReciters);
  const setSurahReciter = useAudioStore((s) => s.setSurahReciter);
  const selected = useAudioStore((s) => s.surahReciterId());
  const savedChoice = useAudioStore((s) => s.surahReciter);
  // Is the ayah reciter itself available as a full-sura reciter?
  const ayahUnsupported = useAudioStore((s) => {
    if (s.surahReciters.state !== 'ready' || s.reciters.state !== 'ready') return false;
    const ayahId = s.reciterId();
    if (!ayahId) return false;
    const ayahName = s.reciters.data.find((r) => r.identifier === ayahId)?.name;
    return !s.surahReciters.data.some((r) => r.identifier === ayahId || (!!ayahName && r.name === ayahName));
  });

  useEffect(() => {
    void load();
    void loadAyahReciters();
  }, [load, loadAyahReciters]);

  return (
    <div className={className}>
      <div className={`${compact ? 'text-xs' : 'text-sm'} ${inline ? (compact ? 'flex items-center gap-1.5' : 'flex items-center gap-3') : compact ? 'space-y-1' : 'space-y-2'}`}>
        <label htmlFor={id} className={inline ? (compact ? 'shrink-0 text-[var(--muted)]' : 'shrink-0 font-semibold') : compact ? 'block text-[var(--muted)]' : 'block'}>
          {label}
          {/* Compact (stacked) layout: the note is a small ⓘ beside the label (tooltip + screen-reader text). */}
          {ayahUnsupported && !savedChoice && compact && !inline && (
            <span title={UNSUPPORTED_NOTE} className="ms-1 cursor-help text-[var(--accent)]">
              ⓘ<span className="sr-only">{UNSUPPORTED_NOTE}</span>
            </span>
          )}
        </label>
        {list.state === 'error' ? (
          <p className="flex flex-1 items-center justify-between gap-2 text-[var(--danger)]" role="alert">
            {list.message}
            <button type="button" className="ui-chip" onClick={() => void load(true)}>
              إعادة المحاولة
            </button>
          </p>
        ) : list.state === 'ready' && list.data.length === 0 ? (
          <p className="text-[var(--muted)]">لا يوجد قرّاء للسورة كاملة حالياً.</p>
        ) : (
          <select
            id={id}
            className={`ui-input ${compact ? 'px-2 py-1 text-xs' : 'px-3 py-2.5'} ${inline ? 'min-w-0 flex-1' : 'w-full'}`}
            disabled={list.state !== 'ready'}
            value={selected ?? ''}
            onChange={(e) => setSurahReciter(e.target.value)}
          >
            {list.state !== 'ready' ? (
              <option value="">جارٍ تحميل القرّاء…</option>
            ) : (
              list.data.map((r) => (
                <option key={r.identifier} value={r.identifier}>
                  {surahReciterLabel(r)}
                  {r.surahCount < 114 ? ` (${r.surahCount} سورة)` : ''}
                </option>
              ))
            )}
          </select>
        )}
        {/* One-line layout: the note becomes a small ⓘ marker (tooltip + screen-reader text). */}
        {ayahUnsupported && !savedChoice && inline && compact && (
          <span title={UNSUPPORTED_NOTE} className="shrink-0 cursor-help text-[var(--accent)]">
            ⓘ<span className="sr-only">{UNSUPPORTED_NOTE}</span>
          </span>
        )}
      </div>
      {ayahUnsupported && !savedChoice && !compact && (
        <p className="mt-2 text-xs text-[var(--muted)]">{UNSUPPORTED_NOTE}</p>
      )}
    </div>
  );
}
