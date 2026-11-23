'use client';

import { useEffect, useRef, useState } from 'react';
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
  const wrapRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLElement>(null);
  const [small, setSmall] = useState(false);
  const [stuck, setStuck] = useState(false);
  const [scrolling, setScrolling] = useState(false);
  /** Phones only, once pinned: one compact line (icon-only layout toggle, short play labels). */
  const compact = small && stuck;
  // The wrapper keeps the bar's normal height while compact, so the page below never shifts.
  const [normalH, setNormalH] = useState<number | null>(null);

  // Phone width = Tailwind's `max-sm` (< 640px); large screens never change.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639.98px)');
    const update = () => setSmall(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Pinned? (the wrapper sits at its sticky offset) and "is the user scrolling right now?".
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    let frame = 0;
    let idle: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      frame = 0;
      const stickyTop = parseFloat(getComputedStyle(wrap).top) || 0;
      setStuck(wrap.getBoundingClientRect().top <= stickyTop + 1 && window.scrollY > 0);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check);
      setScrolling(true);
      clearTimeout(idle);
      idle = setTimeout(() => setScrolling(false), 220);
    };
    check();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(idle);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  // The bar's real height as --sura-bar-h, so #ayah jumps land below it (scroll-margin-top in
  // globals.css); and its normal (non-compact) height for the wrapper. Removed when leaving.
  useEffect(() => {
    const bar = barRef.current;
    if (!bar || typeof ResizeObserver === 'undefined') return;
    const root = document.documentElement;
    const ro = new ResizeObserver(() => {
      root.style.setProperty('--sura-bar-h', `${Math.round(bar.offsetHeight)}px`);
      if (bar.dataset.compact !== 'true') setNormalH(bar.offsetHeight);
    });
    ro.observe(bar);
    return () => {
      ro.disconnect();
      root.style.removeProperty('--sura-bar-h');
    };
  }, []);

  /** Layout buttons: icon + text label (the active one is highlighted); icon only when compact. */
  const segment = (v: AyahView, icon: 'menu' | 'book') => {
    const on = view === v;
    return (
      <button
        type="button"
        role="radio"
        aria-checked={on}
        aria-label={compact ? VIEW_LABEL[v] : undefined}
        title={compact ? VIEW_LABEL[v] : undefined}
        onClick={() => setView(v)}
        className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg py-1.5 text-xs transition ${compact ? 'px-2' : 'px-2.5'} ${
          on ? 'bg-[var(--primary-bg)] font-semibold text-[var(--primary-fg)]' : 'text-[var(--muted)] hover:text-[var(--fg)]'
        }`}
      >
        <Icon name={icon} className="h-4 w-4" />
        {!compact && VIEW_LABEL[v]}
      </button>
    );
  };

  // Two sibling cards (a fragment, so the sticky one's containing block is the whole sura
  // <article>): row 1 stays pinned under the top bar while reading; the reciters scroll away.
  return (
    <>
      {/* Row 1: playback + layout — sticky under the top bar (.sura-sticky-bar, see globals.css).
          The wrapper is what sticks; it keeps the normal height while the card inside is compact
          (transparent and click-through around the card). */}
      <div
        ref={wrapRef}
        className="sura-sticky-bar pointer-events-none sticky top-[calc(var(--topbar-h)+0.5rem)] z-20 !mb-2"
        style={compact && normalH ? { height: normalH } : undefined}
      >
      <section
        ref={barRef}
        aria-label="التلاوة والعرض"
        data-compact={compact}
        className={`ui-elevated pointer-events-auto border border-[var(--border)] px-3 !shadow-[0_8px_24px_rgb(0_0_0/0.18)] transition-opacity duration-300 ${
          compact ? 'py-1.5' : 'py-2.5'
        } ${compact && scrolling ? 'opacity-60' : 'opacity-100'}`}
      >
        <div className={`flex items-center gap-2 ${compact ? 'flex-nowrap justify-between gap-1.5' : 'flex-wrap justify-around'}`}>
          <div className={compact ? 'flex min-w-0 gap-1.5' : undefined}>
            <PlaySuraButton
              suraNumber={suraNumber}
              compact={compact}
              className={compact ? '!gap-1.5 !px-3 !py-2 !text-xs' : ''}
            />
            {/* Hidden once the bar is pinned (scrolled down), on every screen size; the player bar
                still controls playback. Back when scrolled to the top. */}
            {!stuck && <PlayAyahsButton suraNumber={suraNumber} compact={compact} />}
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
      </section>
      </div>

      {/* Row 2: reciters (ayah by ayah / full sura), label above each list */}
      <section aria-label="القرّاء" className="ui-elevated px-3 py-2.5">
        <div className="grid grid-cols-2 gap-3">
          <ReciterSelect compact label="قارئ الآيات" className="min-w-0" />
          <SurahReciterSelect compact label="قارئ السورة" className="min-w-0" />
        </div>
      </section>
    </>
  );
}

/**
 * «تشغيل آية تلو الأخرى»: every ayah of the sura from the first one, through the same per-ayah
 * playback as each ayah's «استماع» button; stops after the last ayah. While that run is active
 * it becomes a pause / resume toggle.
 */
function PlayAyahsButton({ suraNumber, compact = false }: { suraNumber: number; compact?: boolean }) {
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
      className={`${CHIP} border ${compact ? '!gap-1 !px-2.5' : ''} ${
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
