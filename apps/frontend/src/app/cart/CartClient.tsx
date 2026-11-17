'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ExportPdfButton } from '@/components/ExportPdfButton';
import { ShareAsImageModal, type ShareTarget } from '@/components/ShareAsImageModal';
import { useCartDetails } from '@/components/useCartDetails';
import { imageTafsirFor, useCartTafsirDefaults } from '@/components/useCartTafsir';
import { useCartStore } from '@/store/useCartStore';
import { useUiStore } from '@/store/useUiStore';

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
      <p className="text-[var(--muted)]">
        السلة فاضية. أضف آيات من{' '}
        <Link href="/search" className="text-[var(--accent)] underline">
          البحث
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-[var(--danger)]">تعذّر تحميل نصوص الآيات.</p>}
      <ol className="space-y-3">
        {items.map((i, n) => {
          const a = details.get(i.ayahId);
          return (
            <li key={i.ayahId} className="ui-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--muted)]">
                <span>
                  {n + 1}. {a ? `سورة ${a.suraName} · آية ${a.ayahNumber}` : `آية #${i.ayahId}`}
                </span>
                <div className="flex items-center gap-3">
                  {books.length > 0 && (
                    <select
                      aria-label="التفسير"
                      value={i.tafsirBookId ?? ''}
                      onChange={(e) => setTafsir(i.ayahId, e.target.value === '' ? undefined : Number(e.target.value))}
                      className="ui-input !w-auto px-2 py-1"
                    >
                      <option value="">بدون تفسير</option>
                      {books.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <label className="flex cursor-pointer items-center gap-2 text-[var(--fg)]">
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
                      className="text-[var(--accent)]"
                    >
                      تحميل كصورة
                    </button>
                  )}
                  <button type="button" onClick={() => remove(i.ayahId)} className="text-[var(--danger)]">
                    حذف
                  </button>
                </div>
              </div>
              {a && <p className="quran-text mt-2 text-2xl">{a.textUthmani}</p>}
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-60 flex-1">
          <ExportPdfButton />
        </div>
        <button type="button" onClick={clear} className="py-2 text-sm text-[var(--muted)] underline">
          تفريغ السلة
        </button>
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
