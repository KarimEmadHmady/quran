'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ayahHref, type Ayah } from '@/lib/quran';
import { useAudioStore } from '@/store/useAudioStore';
import { useBookmarkStore } from '@/store/useBookmarkStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useUiStore, type AyahView } from '@/store/useUiStore';
import { AyahPlayButton } from './audio/AyahPlayButton';
import { CartToggle } from './CartToggle';
import { Icon } from './Icon';
import { KhatmaButton } from './KhatmaButton';
import { ShareAsImageModal, type ImageAction, type ShareTarget } from './ShareAsImageModal';
import { TafsirPanel } from './TafsirPanel';
import { useAutoKhatmaReading } from './useAutoKhatmaReading';

const toArabicDigits = (n: number) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
const BOOKMARK_DEBOUNCE_MS = 500;

/**
 * Ayahs of a sura or topic page. Text follows the Uthmani/simple setting (reading pages only,
 * claude.md 11.15 decision 4). With `trackBookmark`, the last ayah visible on screen becomes
 * the bookmark (spec 4.7: IntersectionObserver + debounce) — independent of the khatma.
 *
 * Two layouts (toggle at the top): "vertical" = one ayah card below another; "mushaf" = the
 * ayahs flow next to each other like a printed Mushaf page; tapping an ayah shows its actions.
 */
export function AyahList({
  ayahs,
  suraNames,
  trackBookmark = false,
  showRefs = false,
  showViewToggle = true,
}: {
  ayahs: Ayah[];
  /** sura number -> Arabic name (for refs and the image card). */
  suraNames: Record<number, string>;
  trackBookmark?: boolean;
  /** Show "سورة X · آية Y" on each ayah (topic pages). */
  showRefs?: boolean;
  /** false when the page puts the layout choice elsewhere (the sura page's audio menu). */
  showViewToggle?: boolean;
}) {
  const script = useSettingsStore((s) => s.script);
  const saveBookmark = useBookmarkStore((s) => s.save);
  const view = useUiStore((s) => s.ayahView);
  const setView = useUiStore((s) => s.setAyahView);
  const [image, setImage] = useState<{ target: ShareTarget; action: ImageAction } | null>(null);
  const [openTafsir, setOpenTafsir] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Daily wird: on the reading page (the one that tracks the bookmark), ayahs scrolled past are
  // marked «✓ مقروءة» automatically (the «تمت القراءة» button still works too).
  const ayahIds = useMemo(() => ayahs.map((a) => a.id), [ayahs]);
  useAutoKhatmaReading(listRef, ayahIds, trackBookmark, view);
  // The ayah being recited by the shared player (highlighted, and followed while it plays).
  const playingId = useAudioStore((s) => (s.status === 'idle' ? null : (s.current?.ayahId ?? null)));
  const audioActive = useAudioStore((s) => s.status === 'playing' || s.status === 'buffering' || s.status === 'loading');

  useEffect(() => {
    if (playingId === null || !audioActive || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>('[data-ayah-id="' + playingId + '"]');
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [playingId, audioActive]);

  useEffect(() => {
    if (!trackBookmark || !listRef.current || typeof IntersectionObserver === 'undefined') return;
    const visible = new Set<number>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const byId = new Map(ayahs.map((a) => [a.id, a]));
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = Number((e.target as HTMLElement).dataset.ayahId);
          if (e.isIntersecting) visible.add(id);
          else visible.delete(id);
        }
        clearTimeout(timer);
        timer = setTimeout(() => {
          if (visible.size === 0) return;
          const a = byId.get(Math.max(...visible));
          if (a) saveBookmark({ ayahId: a.id, suraNumber: a.suraNumber, ayahNumber: a.ayahNumber });
        }, BOOKMARK_DEBOUNCE_MS);
      },
      { threshold: view === 'mushaf' ? 0.3 : 0.6 },
    );
    listRef.current.querySelectorAll('[data-ayah-id]').forEach((el) => observer.observe(el));
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [ayahs, trackBookmark, saveBookmark, view]);

  useEffect(() => setSelected(null), [view]);

  const toggleTafsir = (id: number) =>
    setOpenTafsir((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const textOf = (a: Ayah) => (script === 'simple' && a.textSimple ? a.textSimple : a.textUthmani);
  const targetOf = (a: Ayah): ShareTarget => ({
    ayahId: a.id,
    suraName: suraNames[a.suraNumber] ?? '',
    suraNumber: a.suraNumber,
    ayahNumber: a.ayahNumber,
    textUthmani: a.textUthmani,
  });

  /** Tafsir / download / share / khatma / cart for one ayah (both layouts). */
  const actions = (a: Ayah) => (
    <>
      <AyahPlayButton suraNumber={a.suraNumber} ayahNumber={a.ayahNumber} />
      <button
        type="button"
        onClick={() => toggleTafsir(a.id)}
        aria-expanded={openTafsir.has(a.id)}
        className={`ui-chip ${openTafsir.has(a.id) ? '!border-[var(--accent)] text-[var(--accent)]' : ''}`}
      >
        <Icon name="tafsir" className="h-4 w-4" />
        التفسير
      </button>
      <button type="button" onClick={() => setImage({ target: targetOf(a), action: 'download' })} className="ui-chip">
        <Icon name="download" className="h-4 w-4" />
        تحميل
      </button>
      <button type="button" onClick={() => setImage({ target: targetOf(a), action: 'share' })} className="ui-chip">
        <Icon name="share" className="h-4 w-4" />
        مشاركة
      </button>
      <KhatmaButton ayahId={a.id} />
      <CartToggle ayahId={a.id} />
    </>
  );

  const selectedAyah = selected === null ? undefined : ayahs.find((a) => a.id === selected);

  return (
    <>
      {showViewToggle && <ViewToggle view={view} onChange={setView} />}

      {view === 'vertical' ? (
        <div ref={listRef}>
          <ol className="space-y-3">
            {ayahs.map((a) => {
              const suraName = suraNames[a.suraNumber] ?? '';
              return (
                <li
                  key={a.id}
                  id={`ayah-${a.id}`}
                  data-ayah-id={a.id}
                  aria-current={playingId === a.id ? 'true' : undefined}
                  className={`ui-card p-5 transition ${playingId === a.id ? '!border-[var(--accent)] ring-2 ring-[var(--accent)]/40' : ''}`}
                >
                  {showRefs && (
                    <Link
                      href={ayahHref(a.suraNumber, a.id)}
                      className="mb-2 block text-sm text-[var(--muted)] hover:text-[var(--accent)]"
                    >
                      سورة {suraName} · آية {a.ayahNumber}
                    </Link>
                  )}
                  <p className="quran-text">
                    {textOf(a)}{' '}
                    <span className="text-[var(--accent)]" aria-label={`آية ${a.ayahNumber}`}>
                      ﴿{toArabicDigits(a.ayahNumber)}﴾
                    </span>
                  </p>
                  <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] pt-3">
                    {actions(a)}
                  </div>
                  {openTafsir.has(a.id) && <TafsirPanel ayahId={a.id} />}
                </li>
              );
            })}
          </ol>
        </div>
      ) : (
        <div ref={listRef} className="ui-card px-5 py-6">
          <p className="quran-text text-justify" style={{ textAlignLast: 'center' }}>
            {ayahs.map((a, i) => {
              const newSura = showRefs && (i === 0 || ayahs[i - 1].suraNumber !== a.suraNumber);
              const isSelected = selected === a.id;
              return (
                <span key={a.id}>
                  {newSura && (
                    <span className="my-2 block text-center font-[family-name:var(--font-ui)] text-sm text-[var(--muted)]">
                      سورة {suraNames[a.suraNumber] ?? ''}
                    </span>
                  )}
                  <span
                    id={`ayah-${a.id}`}
                    data-ayah-id={a.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSelected}
                    aria-label={`آية ${a.ayahNumber}${showRefs ? ` من سورة ${suraNames[a.suraNumber] ?? ''}` : ''}`}
                    onClick={() => setSelected(isSelected ? null : a.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelected(isSelected ? null : a.id);
                      }
                    }}
                    className={`cursor-pointer rounded-md transition-colors ${
                      isSelected
                        ? 'bg-[var(--badge-blue-bg)] text-[var(--badge-blue-fg)]'
                        : playingId === a.id
                          ? 'bg-[var(--mark)] text-[var(--mark-fg)]'
                          : 'hover:bg-[var(--surface-2)]'
                    }`}
                  >
                    {textOf(a)}{' '}
                    <span className="text-[var(--accent)]">﴿{toArabicDigits(a.ayahNumber)}﴾</span>
                  </span>{' '}
                </span>
              );
            })}
          </p>
        </div>
      )}

      {view === 'mushaf' && selectedAyah && (
        <div
          role="region"
          aria-label={`إجراءات الآية ${selectedAyah.ayahNumber}`}
          style={{ bottom: 'calc(5rem + var(--player-h, 0px))' }}
          className="fixed inset-x-0 z-20 mx-auto w-[calc(100%-2rem)] max-w-2xl rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-2xl"
        >
          <div className="mb-2 flex items-center justify-between gap-2 text-sm">
            <span className="font-semibold">
              سورة {suraNames[selectedAyah.suraNumber] ?? ''} · آية {selectedAyah.ayahNumber}
            </span>
            <button
              type="button"
              onClick={() => setSelected(null)}
              aria-label="إغلاق"
              className="rounded-full p-1 text-[var(--muted)] hover:bg-[var(--surface-2)]"
            >
              <Icon name="close" className="h-4 w-4" />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">{actions(selectedAyah)}</div>
          {openTafsir.has(selectedAyah.id) && (
            <div className="max-h-[40vh] overflow-y-auto">
              <TafsirPanel ayahId={selectedAyah.id} />
            </div>
          )}
        </div>
      )}

      {image && <ShareAsImageModal target={image.target} action={image.action} onClose={() => setImage(null)} />}
    </>
  );
}

function ViewToggle({ view, onChange }: { view: AyahView; onChange: (v: AyahView) => void }) {
  const item = (v: AyahView, label: string, icon: 'menu' | 'book') => (
    <button
      type="button"
      role="radio"
      aria-checked={view === v}
      onClick={() => onChange(v)}
      title={label}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition ${
        view === v ? 'bg-[var(--primary-bg)] font-semibold text-[var(--primary-fg)]' : 'text-[var(--muted)] hover:text-[var(--fg)]'
      }`}
    >
      <Icon name={icon} className="h-4 w-4" />
      {label}
    </button>
  );
  return (
    <div className="mb-3 flex justify-end">
      <div role="radiogroup" aria-label="طريقة العرض" className="inline-flex gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1">
        {item('vertical', 'آية تلو الاخرى', 'menu')}
        {item('mushaf', 'وضع المصحف', 'book')}
      </div>
    </div>
  );
}
