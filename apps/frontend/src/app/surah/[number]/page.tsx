import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/AppChrome';
import { AyahList } from '@/components/AyahList';
import { BISMILLAH, PLACE_LABEL, showBismillahHeader } from '@/lib/quran';
import { parseIntParam } from '@/lib/routeParams';
import { getSura } from '@/lib/serverApi';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ number: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const n = parseIntParam((await params).number, 1, 114);
  const data = n ? await getSura(n).catch(() => null) : null;
  return { title: data ? `سورة ${data.sura.nameAr}` : 'سورة' };
}

/** spec §2: /surah/[number] — the whole sura, with tafsir, share, cart, khatma and bookmark. */
export default async function SuraPage({ params }: Props) {
  const n = parseIntParam((await params).number, 1, 114);
  if (n === null) notFound();
  const data = await getSura(n);
  if (!data) notFound();
  const { sura, ayahs } = data;

  return (
    <article className="space-y-5">
      <div>
        <PageHeader title={`سورة ${sura.nameAr}`} backHref="/surah" backLabel="السور" />
        <div className="ui-hero -mt-1 flex items-center justify-between px-5 py-4 text-sm">
          <span className="font-semibold">{sura.nameEn}</span>
          <span className="text-[var(--hero-muted)]">
            {sura.revelationPlace ? `${PLACE_LABEL[sura.revelationPlace]} · ` : ''}
            {sura.ayahCount} آية
          </span>
        </div>
      </div>
      {showBismillahHeader(sura.number, ayahs[0]?.textUthmani) && (
        <p className="quran-text text-center">{BISMILLAH}</p>
      )}
      {ayahs.length === 0 ? (
        <p className="text-center text-[var(--muted)]">مفيش آيات متاحة للسورة دي.</p>
      ) : (
        <AyahList ayahs={ayahs} suraNames={{ [sura.number]: sura.nameAr }} trackBookmark />
      )}
      <nav className="flex justify-between pt-2 text-sm" aria-label="السور المجاورة">
        {sura.number > 1 ? (
          <Link href={`/surah/${sura.number - 1}`} className="ui-chip">
            → السورة السابقة
          </Link>
        ) : (
          <span />
        )}
        {sura.number < 114 && (
          <Link href={`/surah/${sura.number + 1}`} className="ui-chip">
            السورة التالية ←
          </Link>
        )}
      </nav>
    </article>
  );
}
