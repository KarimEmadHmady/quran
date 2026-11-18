'use client';

import { Icon } from '@/components/Icon';
import { adhkarAudioSrc } from '@/lib/adhkarApi';
import { useAdhkarAudioStore } from '@/store/useAdhkarAudioStore';

/**
 * Play / pause for one adhkar recording (item or whole category). Uses the separate adhkar
 * player, never the Quran one. Renders nothing when there is no recording.
 */
export function AdhkarAudioButton({
  id,
  path,
  label,
  compact = false,
}: {
  /** Unique recording id, e.g. "item:1:3" or "category:1". */
  id: string;
  /** API path from the backend (audioUrl). */
  path: string | null;
  label: string;
  compact?: boolean;
}) {
  const src = adhkarAudioSrc(path);
  const mine = useAdhkarAudioStore((s) => s.current === id);
  const status = useAdhkarAudioStore((s) => (s.current === id ? s.status : 'idle'));
  const toggle = useAdhkarAudioStore((s) => s.toggle);
  if (!src) return null;

  const playing = mine && status === 'playing';
  const loading = mine && status === 'loading';
  const failed = mine && status === 'error';
  const action = playing || loading ? 'إيقاف مؤقت' : failed ? 'إعادة المحاولة' : 'استماع';

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => toggle(id, src)}
        aria-label={`${action}: ${label}`}
        aria-pressed={playing}
        className={`ui-chip ${playing || loading ? 'border-[var(--accent)] text-[var(--accent)]' : ''}`}
      >
        {loading ? (
          <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          <Icon name={playing ? 'pause' : failed ? 'refresh' : 'play'} className="h-4 w-4" />
        )}
        {!compact && <span>{loading ? 'جاري التحميل…' : playing ? 'إيقاف' : failed ? 'إعادة' : 'استماع'}</span>}
      </button>
      {failed && (
        <span role="alert" className="text-xs text-[var(--danger)]">
          تعذّر تشغيل الصوت.
        </span>
      )}
    </span>
  );
}
