'use client';

import { useAudioStore } from '@/store/useAudioStore';
import { useUiStore, type AyahView } from '@/store/useUiStore';
import { Icon } from '../Icon';
import { PlaySuraButton } from './AyahPlayButton';
import { ReciterSelect } from './ReciterSelect';
import { SurahReciterSelect } from './SurahReciterSelect';

const VIEW_LABEL: Record<AyahView, string> = { vertical: 'آية تلو الاخرى', mushaf: 'وضع المصحف' };

/** Same height for both play buttons (comfortable tap target). */
const CHIP = 'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs transition';

/**
 * The sura page's recitation and display controls, always visible (no popup), in two compact rows:
 *   1) ▶ السورة كاملة (one MP3) · ▶ آية تلو الأخرى (ayah files)   layout: icon + label (far side)
 *   2) قارئ الآيات ▾ · قارئ السورة ▾  (label above each list, half width each)
 * RTL; row 1 wraps only on very narrow screens. Same behaviour and state as before
 * (useAudioStore / useUiStore).
 */
export function SuraAudioMenu({ suraNumber }: { suraNumber: number }) {
  const view = useUiStore((s) => s.ayahView);
  const setView = useUiStore((s) => s.setAyahView);

  /** Layout buttons: icon + text label (the active one is highlighted). */
  const segment = (v: AyahView, icon: 'menu' | 'book') => {
    const on = view === v;
    return (
      <button
        type="button"
        role="radio"
        aria-checked={on}
        onClick={() => setView(v)}
        className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs transition ${
          on ? 'bg-[var(--primary-bg)] font-semibold text-[var(--primary-fg)]' : 'text-[var(--muted)] hover:text-[var(--fg)]'
        }`}
      >
        <Icon name={icon} className="h-4 w-4" />
        {VIEW_LABEL[v]}
      </button>
    );
  };

  return (
    <section aria-label="التلاوة والعرض" className="ui-elevated space-y-2.5 px-3 py-2.5">
      {/* Row 1: playback + layout */}
      <div className="flex flex-wrap items-center gap-2 justify-around ">
        <div>
          <PlaySuraButton suraNumber={suraNumber} />
          <PlayAyahsButton suraNumber={suraNumber} />
        </div>
        <div
          role="radiogroup"
          aria-label="طريقة العرض"
          className="flex shrink-1 gap-1 rounded-xl border border-[var(--border)] p-0.5"
        >
          {segment('vertical', 'menu')}
          {segment('mushaf', 'book')}
        </div>
      </div>

      {/* Row 2: reciters (ayah by ayah / full sura), label above each list */}
      <div className="grid grid-cols-2 gap-3 border-t border-[var(--border)] pt-2.5">
        <ReciterSelect compact label="قارئ الآيات" className="min-w-0" />
        <SurahReciterSelect compact label="قارئ السورة" className="min-w-0" />
      </div>
    </section>
  );
}

/**
 * «تشغيل آية تلو الأخرى»: every ayah of the sura from the first one, through the same per-ayah
 * playback as each ayah's «استماع» button; stops after the last ayah. While that run is active
 * it becomes a pause / resume toggle.
 */
function PlayAyahsButton({ suraNumber }: { suraNumber: number }) {
  const playSuraAyahs = useAudioStore((s) => s.playSuraAyahs);
  const toggle = useAudioStore((s) => s.toggle);
  const status = useAudioStore((s) => s.status);
  const isThis = useAudioStore((s) => s.session === 'ayah' && s.sequenceSura === suraNumber);
  const active = isThis && status !== 'idle' && status !== 'ended' && status !== 'error';
  const loading = isThis && (status === 'loading' || status === 'buffering');
  const playing = isThis && status === 'playing';

  return (
    <button
      type="button"
      onClick={() => (active ? toggle() : playSuraAyahs(suraNumber))}
      aria-pressed={playing}
      aria-label={playing ? 'إيقاف مؤقت للآيات' : active ? 'متابعة الآيات' : 'تشغيل آية تلو الأخرى'}
      title="تشغيل آية تلو الأخرى (ملف لكل آية)"
      className={`${CHIP} border ${
        active ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--accent)]'
      }`}
    >
      {loading ? (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
      ) : (
        <Icon name={playing ? 'pause' : 'play'} className="h-4 w-4" />
      )}
      {playing ? 'إيقاف' : active ? 'متابعة' : 'آية تلو الأخرى'}
    </button>
  );
}
