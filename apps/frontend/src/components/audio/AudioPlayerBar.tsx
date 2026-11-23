'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import { MAX_REPEAT, type PlaybackMode } from '@/lib/shapes';
import { saveListeningPosition, useAudioStore } from '@/store/useAudioStore';
import { isAdminPath } from '../AppChrome';
import { Icon } from '../Icon';
import { ReciterSelect } from './ReciterSelect';
import { SurahReciterSelect } from './SurahReciterSelect';

/** Height reserved above the bottom tab bar while the player is shown (see --player-h users). */
const PLAYER_HEIGHT = '5.5rem';
const SEEK_STEP = 10;

const AYAH_MODES: { value: PlaybackMode; label: string }[] = [
  { value: 'single', label: 'آية واحدة' },
  { value: 'sura', label: 'حتى نهاية السورة' },
  { value: 'quran', label: 'متواصل (السورة التالية)' },
];

const toArabicDigits = (n: number) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
/** m:ss, or h:mm:ss for long full-sura files. */
const clock = (s: number) => {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(Math.floor(s % 60)).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};

/**
 * The shared player (one for the whole reader, above the bottom tab bar). It shows which mode
 * is playing — «آية بآية» (one file per ayah) or «السورة كاملة» (one file for the sura) — the
 * sura / ayah, the reciter, progress with current time and total duration, and controls:
 * play / pause, previous / next (ayah, or sura in full-sura mode), ±10 s, stop, and a panel
 * with the mode's reciter list, volume and (ayah mode) repeat / continuation.
 * Hidden on the admin dashboard (playback stops there).
 */
export function AudioPlayerBar() {
  const pathname = usePathname();
  const admin = isAdminPath(pathname);
  const s = useAudioStore();
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  /** Something to show: playing / paused / loading now, or a saved session restored (paused). */
  const hasSession = s.status !== 'idle' || s.pending !== null || s.surahPending !== null || s.restored !== null;
  // Shown when opened (bottom-nav «المشغّل», or by starting playback); minimizing keeps playback going.
  const visible = !admin && s.playerOpen;

  // Reserve room for the bar so it never covers the last ayah / floating panels.
  useEffect(() => {
    const root = document.documentElement;
    if (visible) root.style.setProperty('--player-h', PLAYER_HEIGHT);
    else root.style.removeProperty('--player-h');
    return () => {
      root.style.removeProperty('--player-h');
    };
  }, [visible]);

  // Leaving a page (e.g. the reader) saves the listening position right away.
  useEffect(() => {
    return () => saveListeningPosition();
  }, [pathname]);

  // The dashboard has no reader chrome: never keep reciting behind it. Pausing (not stopping)
  // keeps the saved listening position for when the user comes back to the reader.
  const pause = s.pause;
  const status = s.status;
  useEffect(() => {
    if (admin && (status === 'playing' || status === 'buffering' || status === 'loading')) pause();
  }, [admin, status, pause]);

  if (!visible) return null;

  const minimize = () => {
    setExpanded(false);
    s.setPlayerOpen(false);
  };

  if (!hasSession) {
    return (
      <section
        aria-label="مشغّل التلاوة"
        className="fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 mx-auto flex w-[calc(100%-1rem)] max-w-2xl items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/95 px-4 py-3 text-sm shadow-2xl backdrop-blur"
      >
        <Icon name="headphones" className="h-5 w-5 shrink-0 text-[var(--muted)]" />
        <p className="flex-1 text-[var(--muted)]">لا يوجد استماع محفوظ. اضغط «استماع» على أي آية أو شغّل سورة.</p>
        <button
          type="button"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-[var(--surface-2)]"
          onClick={minimize}
          aria-label="إغلاق"
        >
          <Icon name="close" className="h-5 w-5" />
        </button>
      </section>
    );
  }

  const r = s.restored;

  const surahMode = s.session === 'surah';
  const busy = s.status === 'loading' || s.status === 'buffering';
  const playing = s.status === 'playing';
  const surahNumber = s.surahPending ?? s.surahNow?.suraNumber ?? (r?.kind === 'surah' ? r.suraNumber : null);

  let title = '';
  let href: string | null = null;
  if (r) {
    // Saved last time; nothing is loaded until the user presses play.
    title =
      r.kind === 'surah'
        ? `سورة ${r.suraName}`
        : `سورة ${r.suraName} · آية ${toArabicDigits(r.ayahNumber ?? 1)}`;
    href = `/surah/${r.suraNumber}`;
  } else if (surahMode) {
    title = s.surahNow && !s.surahPending ? `سورة ${s.surahNow.suraName}` : 'جارٍ تحميل السورة…';
    href = surahNumber ? `/surah/${surahNumber}` : null;
  } else if (s.current) {
    title = `سورة ${s.current.suraName} · آية ${toArabicDigits(s.current.ayahNumber)}`;
    href = `/surah/${s.current.suraNumber}#ayah-${s.current.ayahId}`;
  } else if (s.pending) {
    title = 'جارٍ تحميل التلاوة…';
  }
  const reciterName = r
    ? r.reciterName
    : surahMode
      ? s.surahPending
        ? null
        : s.surahNow?.reciterName
      : s.current?.reciterName;
  const canStep = r ? true : surahMode ? surahNumber !== null : !!s.current;
  /** Progress can be moved before the file is loaded again (restored session) when its length is known. */
  const canSeek = !!s.duration;
  const btn =
    'flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition hover:bg-[var(--surface-2)] disabled:opacity-40';

  return (
    <section
      aria-label="مشغّل التلاوة"
      className="fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 mx-auto w-[calc(100%-1rem)] max-w-2xl rounded-2xl border border-[var(--border)] bg-[var(--surface)]/95 shadow-2xl backdrop-blur"
    >
      {expanded && (
        <div id={panelId} className="space-y-4 border-b border-[var(--border)] p-4">
          {surahMode ? <SurahReciterSelect /> : <ReciterSelect label="قارئ الآيات" />}
          <label className="block space-y-2 text-sm">
            <span className="flex justify-between">
              <span>مستوى الصوت</span>
              <span className="text-[var(--muted)]">{Math.round(s.volume * 100)}٪</span>
            </span>
            <span className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-full p-1 hover:bg-[var(--surface-2)]"
                onClick={() => s.setVolume(s.volume > 0 ? 0 : 1)}
                aria-label={s.volume > 0 ? 'كتم الصوت' : 'إلغاء الكتم'}
              >
                <Icon name={s.volume > 0 ? 'volume' : 'mute'} className="h-5 w-5" />
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={s.volume}
                onChange={(e) => s.setVolume(Number(e.target.value))}
                className="w-full accent-[var(--accent)]"
                aria-label="مستوى الصوت"
              />
            </span>
          </label>
          {surahMode ? (
            <label className="block space-y-2 text-sm">
              <span>بعد انتهاء السورة</span>
              <select
                className="ui-input w-full px-3 py-2.5"
                value={s.mode === 'quran' ? 'quran' : 'sura'}
                onChange={(e) => s.setMode(e.target.value as PlaybackMode)}
              >
                <option value="sura">إيقاف</option>
                <option value="quran">تشغيل السورة التالية</option>
              </select>
            </label>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-2 text-sm">
                <span>تكرار كل آية</span>
                <select
                  className="ui-input w-full px-3 py-2.5"
                  value={s.repeat}
                  onChange={(e) => s.setRepeat(Number(e.target.value))}
                >
                  <option value={1}>بدون تكرار</option>
                  {Array.from({ length: MAX_REPEAT - 1 }, (_, i) => i + 2).map((n) => (
                    <option key={n} value={n}>
                      {toArabicDigits(n)} مرات
                    </option>
                  ))}
                  <option value={0}>تكرار مستمر</option>
                </select>
              </label>
              <label className="block space-y-2 text-sm">
                <span>بعد انتهاء الآية</span>
                <select
                  className="ui-input w-full px-3 py-2.5"
                  value={s.mode}
                  onChange={(e) => s.setMode(e.target.value as PlaybackMode)}
                >
                  {AYAH_MODES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </div>
      )}

      <div className="px-3 pb-2 pt-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={`${btn} bg-[var(--primary-bg)] text-[var(--primary-fg)] hover:!bg-[var(--primary-bg)]`}
            onClick={s.toggle}
            aria-label={playing || busy ? 'إيقاف مؤقت' : 'تشغيل'}
          >
            {busy ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
            ) : (
              <Icon name={playing ? 'pause' : 'play'} className="h-5 w-5" />
            )}
          </button>
          <button
            type="button"
            className={btn}
            onClick={s.prev}
            disabled={!canStep || (surahMode && surahNumber === 1 && !s.position)}
            aria-label={surahMode ? 'السورة السابقة' : 'الآية السابقة'}
            title={surahMode ? 'السورة السابقة' : 'الآية السابقة'}
          >
            <Icon name="prev" className="h-5 w-5" />
          </button>
          <button
            type="button"
            className={btn}
            onClick={s.next}
            disabled={!canStep || (surahMode && surahNumber === 114)}
            aria-label={surahMode ? 'السورة التالية' : 'الآية التالية'}
            title={surahMode ? 'السورة التالية' : 'الآية التالية'}
          >
            <Icon name="next" className="h-5 w-5" />
          </button>

          <div className="min-w-0 flex-1 px-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className={`ui-badge shrink-0 ${surahMode ? 'ui-badge-green' : 'ui-badge-blue'}`}>
                {surahMode ? 'السورة كاملة' : 'آية بآية'}
              </span>
              {href ? (
                <Link href={href} className="truncate text-sm font-semibold hover:text-[var(--accent)]">
                  {title}
                </Link>
              ) : (
                <p className="truncate text-sm font-semibold">{title}</p>
              )}
            </div>
            <p className="truncate text-xs text-[var(--muted)]" aria-live="polite">
              {s.error ? (
                <span className="text-[var(--danger)]">{s.error}</span>
              ) : (
                <>
                  {reciterName}
                  {!surahMode && s.repeat !== 1 && s.current && (
                    <span className="ms-2">
                      <Icon name="repeat" className="inline h-3 w-3" />{' '}
                      {s.repeat === 0
                        ? '∞'
                        : `${toArabicDigits(Math.min(s.played + 1, s.repeat))}/${toArabicDigits(s.repeat)}`}
                    </span>
                  )}
                  {r && <span className="ms-2">متوقف عند آخر موضع استماع</span>}
                  {s.status === 'ended' && <span className="ms-2">انتهى التشغيل</span>}
                  {s.notice && <span className="ms-2">{s.notice}</span>}
                </>
              )}
            </p>
          </div>

          {s.error && s.retryable && (
            <button type="button" className={btn} onClick={s.retry} aria-label="إعادة المحاولة" title="إعادة المحاولة">
              <Icon name="refresh" className="h-5 w-5" />
            </button>
          )}
          {!surahMode && (
            <button
              type="button"
              className={`${btn} ${s.repeat !== 1 ? 'text-[var(--accent)]' : ''}`}
              onClick={() => s.setRepeat(s.repeat === 1 ? 0 : 1)}
              aria-pressed={s.repeat !== 1}
              aria-label={s.repeat === 1 ? 'تكرار الآية' : 'إيقاف التكرار'}
              title="تكرار الآية"
            >
              <Icon name="repeat" className="h-5 w-5" />
            </button>
          )}
          <button
            type="button"
            className={btn}
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            aria-controls={panelId}
            aria-label="إعدادات التلاوة"
          >
            <Icon name="settings" className="h-5 w-5" />
          </button>
          <button type="button" className={btn} onClick={minimize} aria-label="تصغير المشغّل" title="تصغير (التشغيل يستمر)">
            <Icon name="chevron" className="h-5 w-5 -rotate-90" />
          </button>
          <button
            type="button"
            className={btn}
            onClick={s.stop}
            aria-label="إيقاف وإغلاق المشغّل"
            title="إيقاف وإغلاق (ينسى موضع الاستماع)"
          >
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-1 flex items-center gap-2 text-[0.7rem] tabular-nums text-[var(--muted)]" dir="ltr">
          <button
            type="button"
            className="rounded px-1 hover:text-[var(--fg)] disabled:opacity-40"
            onClick={() => s.seekBy(-SEEK_STEP)}
            disabled={!canSeek}
            aria-label="رجوع ١٠ ثوانٍ"
            title="-10s"
          >
            −10
          </button>
          <span aria-label="الوقت الحالي">{clock(s.position)}</span>
          <input
            type="range"
            min={0}
            max={s.duration || 0}
            step={0.1}
            value={Math.min(s.position, s.duration || 0)}
            onChange={(e) => s.seek(Number(e.target.value))}
            disabled={!canSeek}
            className="h-1 w-full accent-[var(--accent)]"
            aria-label="موضع التشغيل"
          />
          <span aria-label="المدة الكلية">{clock(s.duration)}</span>
          <button
            type="button"
            className="rounded px-1 hover:text-[var(--fg)] disabled:opacity-40"
            onClick={() => s.seekBy(SEEK_STEP)}
            disabled={!canSeek}
            aria-label="تقديم ١٠ ثوانٍ"
            title="+10s"
          >
            +10
          </button>
        </div>
      </div>
    </section>
  );
}
