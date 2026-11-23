'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useCartStore } from '@/store/useCartStore';
import { useUiStore } from '@/store/useUiStore';
import { BottomSheet } from './BottomSheet';
import { ExportPdfButton } from './ExportPdfButton';
import { Icon } from './Icon';
import { ShareAsImageModal, type ShareTarget } from './ShareAsImageModal';
import { useCartDetails } from './useCartDetails';
import { imageTafsirFor, useCartTafsirDefaults } from './useCartTafsir';

/**
 * spec 4.1 cart drawer, styled as the design's bottom sheet: the items (remove each),
 * "تحميل PDF", review link and clear. Opened from the bottom tab bar.
 */
export function FloatingCart() {
  const isOpen = useUiStore((s) => s.sheet === 'cart');
  const close = useUiStore((s) => s.close);
  const remove = useCartStore((s) => s.remove);
  const clear = useCartStore((s) => s.clear);
  const { items, details, error } = useCartDetails(isOpen);
  const [download, setDownload] = useState<ShareTarget | null>(null);
  const tafsirOff = useUiStore((s) => s.cartTafsirOff);
  const toggleTafsir = useUiStore((s) => s.toggleCartTafsir);
  // Same default tafsir as /cart, applied as soon as the drawer opens.
  useCartTafsirDefaults(isOpen);
  const [downloadContent, setDownloadContent] = useState<'ayah' | 'ayah_tafsir'>('ayah');
  if (!isOpen) return null;

  return (
    <BottomSheet label="مختاراتي" onClose={close}>
      <header className="mb-4 flex items-center justify-between pl-10">
        <h2 className="text-lg font-bold">مختاراتي</h2>
        <span className="ui-badge ui-badge-blue">{items.length} آية</span>
      </header>
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--muted)]">
          مختاراتي فاضية.{' '}
          <Link href="/search" onClick={close} className="text-[var(--accent)] underline">
            ابحث وأضف آيات
          </Link>
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {items.map((i) => {
              const a = details.get(i.ayahId);
              return (
                <li key={i.ayahId} className="flex items-center gap-3 rounded-2xl bg-[var(--surface-2)] p-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{a ? `${a.suraName} - آية ${a.ayahNumber}` : `آية #${i.ayahId}`}</p>
                    {i.tafsirBookId !== undefined && <p className="text-xs text-[var(--accent)]">+ تفسير</p>}
                    {a && <p className="quran-text mt-1 truncate !text-base !leading-8 text-[var(--muted)]">{a.textUthmani}</p>}
                  <label className="mt-1 flex w-fit cursor-pointer items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={!tafsirOff.includes(i.ayahId)}
                      onChange={() => toggleTafsir(i.ayahId)}
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                    تضمين التفسير
                  </label>
                  </div>
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
                      aria-label="تحميل كصورة"
                      title={tafsirOff.includes(i.ayahId) ? 'تحميل الآية فقط' : 'تحميل الآية مع التفسير'}
                      className="rounded-full p-1.5 text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--accent)]"
                    >
                      <Icon name="download" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => remove(i.ayahId)}
                    aria-label="حذف"
                    className="rounded-full p-1.5 text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--danger)]"
                  >
                    <Icon name="close" />
                  </button>
                </li>
              );
            })}
            {error && <li className="text-sm text-[var(--danger)]">تعذّر تحميل نصوص الآيات.</li>}
          </ul>
          <div className="mt-4 space-y-3">
            <ExportPdfButton />
            <div className="flex justify-between text-sm">
              <Link href="/cart" onClick={close} className="text-[var(--accent)] underline">
                مراجعة مختاراتي وإضافة التفسير
              </Link>
              <button type="button" onClick={clear} className="text-[var(--muted)] underline">
                تفريغ مختاراتي
              </button>
            </div>
          </div>
        </>
      )}
      {download && (
        <ShareAsImageModal
          target={download}
          action="download"
          content={downloadContent}
          onClose={() => setDownload(null)}
        />
      )}
    </BottomSheet>
  );
}
