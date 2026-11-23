'use client';

import { useAudioStore } from '@/store/useAudioStore';
import { Icon } from '../Icon';

/** "استماع" chip on every ayah: plays it with the selected reciter, or pauses / resumes it. */
export function AyahPlayButton({ suraNumber, ayahNumber }: { suraNumber: number; ayahNumber: number }) {
  const isCurrent = useAudioStore((s) => s.current?.suraNumber === suraNumber && s.current?.ayahNumber === ayahNumber);
  const isPending = useAudioStore((s) => s.pending?.suraNumber === suraNumber && s.pending?.ayahNumber === ayahNumber);
  const status = useAudioStore((s) => s.status);
  const playAyah = useAudioStore((s) => s.playAyah);
  const toggle = useAudioStore((s) => s.toggle);

  const loading = (isPending && status === 'loading') || (isCurrent && (status === 'loading' || status === 'buffering'));
  const playing = isCurrent && status === 'playing';
  const active = isCurrent && status !== 'idle' && status !== 'ended' && status !== 'error';

  return (
    <button
      type="button"
      onClick={() => (active && !isPending ? toggle() : playAyah(suraNumber, ayahNumber))}
      aria-pressed={playing}
      aria-label={playing ? `إيقاف مؤقت للآية ${ayahNumber}` : `استماع للآية ${ayahNumber}`}
      className={`ui-chip ${active ? '!border-[var(--accent)] text-[var(--accent)]' : ''}`}
    >
      {loading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
      ) : (
        <Icon name={playing ? 'pause' : 'play'} className="h-4 w-4" />
      )}
      {playing ? 'إيقاف مؤقت' : 'استماع'}
    </button>
  );
}

/**
 * "تشغيل السورة كاملة" (Mode B): plays the whole sura from ONE MP3 file with the selected
 * full-sura reciter. While that sura is the one playing, it becomes a pause / resume toggle.
 */
export function PlaySuraButton({
  suraNumber,
  className = '',
  compact = false,
  iconOnly = false,
}: {
  suraNumber: number;
  className?: string;
  /** Short label («السورة كاملة»); the full label stays as tooltip / accessible name. */
  compact?: boolean;
  /** Round icon-only button (the sura list rows); same behaviour, label kept as aria-label. */
  iconOnly?: boolean;
}) {
  const playFullSurah = useAudioStore((s) => s.playFullSurah);
  const toggle = useAudioStore((s) => s.toggle);
  const status = useAudioStore((s) => s.status);
  const isThis = useAudioStore(
    (s) => s.session === 'surah' && (s.surahPending ?? s.surahNow?.suraNumber) === suraNumber,
  );
  const active = isThis && status !== 'idle' && status !== 'ended' && status !== 'error';
  const loading = isThis && (status === 'loading' || status === 'buffering');
  const playing = isThis && status === 'playing';
  const onClick = () => (active ? toggle() : playFullSurah(suraNumber));
  const label = playing ? 'إيقاف مؤقت للسورة' : active ? 'متابعة السورة' : 'تشغيل السورة كاملة';

  if (iconOnly) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={playing}
        aria-label={label}
        title={label}
        className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition ${
          active ? 'bg-[var(--primary-bg)] text-[var(--primary-fg)]' : 'bg-[var(--surface-2)] text-[var(--fg)] hover:text-[var(--accent)]'
        } ${className}`}
      >
        {loading ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
        ) : (
          <Icon name={playing ? 'pause' : 'play'} className="h-4 w-4" />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={playing}
      aria-label={label}
      title={compact ? 'تشغيل السورة كاملة (ملف واحد)' : undefined}
      className={`ui-btn-primary inline-flex shrink-0 items-center justify-center gap-2 px-4 py-2.5 text-sm ${className} ${
        active ? 'ring-2 ring-[var(--accent)]' : ''
      }`}
    >
      {loading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
      ) : (
        <Icon name={playing ? 'pause' : 'headphones'} className="h-4 w-4" />
      )}
      {playing ? (compact ? 'إيقاف' : 'إيقاف مؤقت') : active ? (compact ? 'متابعة' : 'متابعة السورة') : compact ? 'السورة كاملة' : 'تشغيل السورة كاملة'}
    </button>
  );
}
