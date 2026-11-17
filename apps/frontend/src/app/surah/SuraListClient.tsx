'use client';

import Link from 'next/link';
import { useState } from 'react';
import { PLACE_LABEL, type SuraInfo } from '@/lib/quran';

/** Strip diacritics / hamza forms so "الاخلاص" finds "الإخلاص". */
const fold = (s: string) =>
  s
    .normalize('NFKC')
    .replace(/[ً-ٰٟ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .trim();

/** Design: search field + rows (number circle, name, ayah count, place badge). */
export function SuraListClient({ suras }: { suras: SuraInfo[] }) {
  const [filter, setFilter] = useState('');
  const f = fold(filter);
  const shown = f
    ? suras.filter((s) => fold(s.nameAr).includes(f) || String(s.number) === f || s.nameEn.toLowerCase().includes(f.toLowerCase()))
    : suras;

  return (
    <div className="space-y-4">
      <input
        type="search"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="ابحث باسم السورة أو رقمها…"
        aria-label="تصفية السور"
        className="ui-input px-4 py-3"
      />
      {shown.length === 0 ? (
        <p className="py-6 text-center text-[var(--muted)]">مفيش سورة بالاسم ده.</p>
      ) : (
        <ul className="ui-card divide-y divide-[var(--border)] overflow-hidden">
          {shown.map((s) => (
            <li key={s.number}>
              <Link href={`/surah/${s.number}`} className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--surface-2)]">
                <span className="ui-num">{s.number}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">سورة {s.nameAr}</span>
                  <span className="text-xs text-[var(--muted)]">{s.ayahCount} آية</span>
                </span>
                {s.revelationPlace && (
                  <span className={`ui-badge ${s.revelationPlace === 'mecca' ? 'ui-badge-green' : 'ui-badge-blue'}`}>
                    {PLACE_LABEL[s.revelationPlace]}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
