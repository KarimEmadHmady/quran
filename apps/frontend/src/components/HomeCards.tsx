'use client';

import Link from 'next/link';
import { isFinished, isTodayDone, localDate, progress } from '@/lib/khatma';
import { ayahHref } from '@/lib/quran';
import { useBookmarkStore } from '@/store/useBookmarkStore';
import { useKhatmaStore } from '@/store/useKhatmaStore';

/** spec 4.7 "أكمل القراءة من هنا" (design: navy hero card) + a khatma summary. Independent. */
export function HomeCards({ suraNames }: { suraNames: Record<number, string> }) {
  const bookmark = useBookmarkStore((s) => s.bookmark);
  const bHydrated = useBookmarkStore((s) => s.hydrated);
  const khatma = useKhatmaStore((s) => s.khatma);
  const kHydrated = useKhatmaStore((s) => s.hydrated);
  if (!bHydrated || !kHydrated) return null;

  return (
    <div className="space-y-3">
      {bookmark && (
        <Link href={ayahHref(bookmark.suraNumber, bookmark.ayahId)} className="ui-hero block p-5" data-testid="continue-reading">
          <span className="block text-sm text-[var(--hero-muted)]">أكمل القراءة من هنا</span>
          <span className="mt-1 block text-lg font-bold">
            سورة {suraNames[bookmark.suraNumber] ?? bookmark.suraNumber} - آية {bookmark.ayahNumber}
          </span>
        </Link>
      )}
      <Link href="/khatma" className="ui-card block p-4 hover:border-[var(--accent)]">
        <span className="block text-sm text-[var(--muted)]">الورد اليومى </span>
        <span className="font-bold">
          {!khatma
            ? 'ابدأ خطة ختمة'
            : isFinished(khatma)
              ? 'ختمت القرآن ✓'
              : `${Math.round(progress(khatma) * 1000) / 10}% · ${isTodayDone(khatma, localDate()) ? 'ورد النهارده خلص ✓' : 'اجعل للقرآن نصيبًا من يومك'}`}
        </span>
      </Link>
    </div>
  );
}
