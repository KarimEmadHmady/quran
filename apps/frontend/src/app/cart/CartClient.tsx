'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ExportPdfButton } from '@/components/ExportPdfButton';
import { Icon } from '@/components/Icon';
import { ShareAsImageModal, type ShareTarget } from '@/components/ShareAsImageModal';
import { useCartDetails } from '@/components/useCartDetails';
import { imageTafsirFor, useCartTafsirDefaults } from '@/components/useCartTafsir';
import { useCartStore } from '@/store/useCartStore';
import { useUiStore } from '@/store/useUiStore';

const num = (n: number) => n.toLocaleString('ar-EG');

/** Number square colours, cycled per card (same as the topics / adhkar lists). */
const TONES = [
  'bg-[var(--tile-mint)] text-[var(--accent)]',
  'bg-[var(--tile-sand)] text-[var(--gold)]',
  'bg-[var(--tile-gray)] text-[var(--accent)]',
];

/** spec 2 / 4.1: review the cart before exporting; optionally attach a tafsir per ayah. */
export function CartClient() {
  const [mounted, setMounted] = useState(false);
  const remove = useCartStore((s) => s.remove);
  const setTafsir = useCartStore((s) => s.setTafsir);
  const clear = useCartStore((s) => s.clear);
  const { items, details, error } = useCartDetails(mounted);
  const [download, setDownload] = useState<ShareTarget | null>(null);
  const tafsirOff = useUiStore((s) => s.cartTafsirOff);
  const toggleTafsir = useUiStore((s) => s.toggleCartTafsir);

  useEffect(() => setMounted(true), []);
  // Shared with the cart drawer: book list + default tafsir (first book after «بدون تفسير»);
  // manual choices and explicit «بدون تفسير» are kept.
  const books = useCartTafsirDefaults(mounted);
  const [downloadContent, setDownloadContent] = useState<'ayah' | 'ayah_tafsir'>('ayah');

  if (!mounted) return null;
  if (items.length === 0) {
    return (
      <div className="ui-elevated px-6 py-10 text-center" role="status">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--tile-sand)] text-[var(--gold)]">
          <Icon name="cart" className="h-6 w-6" />
        </span>
        <p className="font-semibold">مختاراتي فاضية.</p>
        <p className="mt-1 text-sm text-[var(--muted)]">
          أضف آيات من{' '}
          <Link href="/search" className="text-[var(--accent)] underline">
            البحث
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Green hero (same as the topic / adhkar heroes). */}
      <div className="relative overflow-hidden rounded-[1.5rem] bg-[var(--hero)] px-5 py-6 text-[var(--hero-fg)] shadow-[var(--shadow-card)]">
        {/* eslint-disable-next-line @next/next/no-img-element -- decorative static image */}
        <img
          src="/mosque-bg.png"
          alt=""
          aria-hidden
          className="pointer-events-none absolute -left-10 top-1/2 h-[150%] -translate-y-1/2 select-none opacity-[0.08]"
        />
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs text-[var(--hero-muted)]">
            <Icon name="cart" className="h-3.5 w-3.5" />
            {items.length === 1 ? 'آية واحدة' : `${num(items.length)} آية`}
          </span>
          <p className="mt-3 text-2xl font-bold leading-snug">الآيات المختارة</p>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-[var(--danger)]">
          تعذّر تحميل نصوص الآيات.
        </p>
      )}
      <ol className="space-y-3">
        {items.map((i, n) => {
          const a = details.get(i.ayahId);
          return (
            <li key={i.ayahId} className="ui-elevated p-5">
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${TONES[n % TONES.length]}`}
                >
                  {num(n + 1)}
                </span>
                <span className="min-w-0 flex-1 truncate font-bold">
                  {a ? `سورة ${a.suraName}` : `آية #${i.ayahId}`}
                  {a && <span className="ms-2 text-sm font-normal text-[var(--muted)]">آية {num(a.ayahNumber)}</span>}
                </span>
                <button
                  type="button"
                  onClick={() => remove(i.ayahId)}
                  aria-label="حذف"
                  title="حذف"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--danger)] hover:bg-[var(--surface-2)]"
                >
                  <Icon name="trash" className="h-5 w-5" />
                </button>
              </div>

              {a && <p className="quran-text mt-3 text-2xl">{a.textUthmani}</p>}

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-4 text-sm">
                {books.length > 0 && (
                  <select
                    aria-label="التفسير"
                    value={i.tafsirBookId ?? ''}
                    onChange={(e) => setTafsir(i.ayahId, e.target.value === '' ? undefined : Number(e.target.value))}
                    className="rounded-full border border-transparent bg-[var(--surface-2)] px-3 py-1.5 text-sm text-[var(--fg)] outline-none focus:border-[var(--accent)]"
                  >
                    <option value="">بدون تفسير</option>
                    {books.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                )}
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-[var(--surface-2)] px-3 py-1.5 text-[var(--fg)]">
                  <input
                    type="checkbox"
                    checked={!tafsirOff.includes(i.ayahId)}
                    onChange={() => toggleTafsir(i.ayahId)}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  تضمين التفسير
                </label>
                {a && (
                  <button
                    type="button"
                    onClick={() => {
                      const t = imageTafsirFor(i, tafsirOff);
                      setDownloadContent(t.content);
                      setDownload({
                        ayahId: a.id,
                        suraName: a.suraName,
                        suraNumber: a.suraNumber,
                        ayahNumber: a.ayahNumber,
                        textUthmani: a.textUthmani,
                        tafsirBookId: t.tafsirBookId,
                      });
                    }}
                    className="ms-auto inline-flex items-center gap-1.5 rounded-full bg-[var(--tile-mint)] px-3 py-1.5 font-semibold text-[var(--accent)] hover:brightness-95"
                  >
                    <Icon name="share" className="h-4 w-4" />
                    تحميل كصورة
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="ui-elevated space-y-3 p-4">
        <ExportPdfButton className="!rounded-full py-3.5" />
        <div className="flex justify-center">
          <button
            type="button"
            onClick={clear}
            className="inline-flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-[var(--danger)]"
          >
            <Icon name="trash" className="h-4 w-4" />
            تفريغ مختاراتي
          </button>
        </div>
      </div>
      {download && (
        <ShareAsImageModal
          target={download}
          action="download"
          content={downloadContent}
          onClose={() => setDownload(null)}
        />
      )}
    </div>
  );
}
