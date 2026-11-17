'use client';

import { useState } from 'react';
import { ApiRequestError, downloadBlob, exportPdf } from '@/lib/api';
import { useCartStore } from '@/store/useCartStore';
import { Icon } from './Icon';
import { prepareCartExport } from './useCartTafsir';

/**
 * "تحميل PDF" (spec 4.1): POST /export/pdf with the cart, then saves the file. Used by the cart
 * drawer and /cart: the items go through the shared tafsir preparation (default book + each
 * item's «تضمين التفسير» checkbox), so the PDF is the same from either place.
 */
export function ExportPdfButton({ className = '' }: { className?: string }) {
  const items = useCartStore((s) => s.items);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      downloadBlob(await exportPdf(await prepareCartExport()), 'quran-selection.pdf');
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 429) setError('تصدير كتير في وقت قصير. استنى دقيقة.');
      else if (e instanceof ApiRequestError && e.status === 503) setError('التصدير مش متاح على الخادم دلوقتي.');
      else if (e instanceof ApiRequestError && e.status === 404) setError('آية في السلة مش موجودة. احذفها وجرّب تاني.');
      else setError('تعذّر إنشاء ملف PDF.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={run}
        disabled={busy || items.length === 0}
        className={`ui-btn-primary flex w-full items-center justify-center gap-2 px-4 py-3 ${className}`}
      >
        <Icon name="download" />
        {busy ? 'جاري إنشاء الملف…' : `تحميل PDF (${items.length})`}
      </button>
      {error && (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {error}
        </p>
      )}
    </div>
  );
}
