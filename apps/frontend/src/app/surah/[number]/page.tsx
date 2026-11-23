import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { AyahList } from '@/components/AyahList';
import { SuraAudioMenu } from '@/components/audio/SuraAudioMenu';
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

  // Juz range of this sura, from its ayahs (real data; empty when the sura has no ayahs).
  const firstJuz = ayahs[0]?.juz;
  const lastJuz = ayahs[ayahs.length - 1]?.juz;
  const juzText = firstJuz ? (lastJuz && lastJuz !== firstJuz ? `الجزء ${firstJuz}–${lastJuz}` : `الجزء ${firstJuz}`) : null;
  const navBtn =
    'inline-flex items-center gap-1.5 rounded-full bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--accent)] shadow-[var(--shadow-card)] hover:bg-[var(--surface-2)]';

  return (
    <article className="space-y-5">
      {/* Title row (design): name + place badge, juz / ayah count; back to the list on the far side. */}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold">
            سورة {sura.nameAr}
            {sura.revelationPlace && <span className="ui-badge ui-badge-blue">{PLACE_LABEL[sura.revelationPlace]}</span>}
          </h1>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {juzText ? `${juzText} • ` : ''}
            {sura.ayahCount} آية
          </p>
        </div>
        <Link
          href="/surah"
          aria-label="السور"
          className="ui-btn-primary inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-xs"
        >
          <Icon name="back" className="h-4 w-4" />
          السور
        </Link>
      </header>

      {/* Green hero (design). */}
      <div className="relative overflow-hidden rounded-[1.5rem] bg-[var(--hero)] px-5 py-6 text-center text-[var(--hero-fg)] shadow-[var(--shadow-card)]">
        {/* eslint-disable-next-line @next/next/no-img-element -- decorative static image */}
        <img
          src="/geometry-bg.png"
          alt=""
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 h-36 w-auto select-none opacity-60"
        />
        <div className="relative">
          <div aria-hidden className="flex items-center justify-center gap-2 text-[var(--hero-muted)]">
            <span className="h-px w-12 bg-current opacity-60" />
            <span className="text-[0.6rem]">◆</span>
            <span className="text-sm">{sura.nameEn}</span>
            <span className="text-[0.6rem]">◆</span>
            <span className="h-px w-12 bg-current opacity-60" />
          </div>
          <p className="mt-1 font-[family-name:var(--font-quran)] text-4xl leading-[1.8]">سورة {sura.nameAr}</p>
          <p className="text-xs text-white/70">
            {sura.revelationPlace ? `${PLACE_LABEL[sura.revelationPlace]} • ` : ''}ترتيبها في المصحف: {sura.number}
          </p>
        </div>
      </div>

      {/* Listening (full sura / ayah by ayah, both reciters) and layout, in one compact menu. */}
      {ayahs.length > 0 && <SuraAudioMenu suraNumber={sura.number} />}
      {showBismillahHeader(sura.number, ayahs[0]?.textUthmani) && (
        <div className="text-center">
          <p className="quran-text text-[var(--gold)]">{BISMILLAH}</p>
          <span aria-hidden className="mx-auto mt-2 block h-0.5 w-20 rounded-full bg-[var(--brand-gold)] opacity-70" />
        </div>
      )}
      {ayahs.length === 0 ? (
        <p className="text-center text-[var(--muted)]">مفيش آيات متاحة للسورة دي.</p>
      ) : (
        <AyahList ayahs={ayahs} suraNames={{ [sura.number]: sura.nameAr }} trackBookmark showViewToggle={false} />
      )}
      <nav className="flex justify-between pt-2" aria-label="السور المجاورة">
        {sura.number > 1 ? (
          <Link href={`/surah/${sura.number - 1}`} className={navBtn}>
            → السورة السابقة
          </Link>
        ) : (
          <span />
        )}
        {sura.number < 114 && (
          <Link href={`/surah/${sura.number + 1}`} className={navBtn}>
            السورة التالية ←
          </Link>
        )}
      </nav>
    </article>
  );
}
