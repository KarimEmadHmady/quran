import Link from 'next/link';
import { HomeCards, HomeDate } from '@/components/HomeCards';
import { Icon, type IconName } from '@/components/Icon';
import { getSuras } from '@/lib/serverApi';

export const dynamic = 'force-dynamic';

type Tone = 'mint' | 'sand' | 'gray';

const TONE: Record<Tone, { bg: string; icon: string }> = {
  mint: { bg: 'bg-[var(--tile-mint)]', icon: 'bg-[var(--tile-mint-icon)]' },
  sand: { bg: 'bg-[var(--tile-sand)]', icon: 'bg-[var(--tile-sand-icon)]' },
  gray: { bg: 'bg-[var(--tile-gray)]', icon: 'bg-[var(--tile-gray-icon)]' },
};

export default async function HomePage() {
  // Names / lengths for the "continue reading" card; the page still works if the API is down.
  const suras = await getSuras().catch(() => []);
  const info = Object.fromEntries(suras.map((s) => [s.number, { name: s.nameAr, ayahCount: s.ayahCount }]));

  // Design order (RTL grid: right, left, right, left); an odd last tile spans the whole row.
  const tiles: { href: string; label: string; hint: string; icon: IconName; tone: Tone }[] = [
    { href: '/surah', label: 'قراءة القرآن', hint: suras.length ? `${suras.length} سورة بالتلاوات` : 'السور بالتلاوات', icon: 'book', tone: 'mint' },
    { href: '/topics', label: 'المواضيع', hint: 'آيات مصنفة حسب الموضوع', icon: 'grid', tone: 'sand' },
    { href: '/khatma', label: 'الختمة', hint: 'الورد اليومي ومتابعة التقدم', icon: 'calendar', tone: 'gray' },
    { href: '/search', label: 'البحث', hint: 'بالكتابة أو بصوتك', icon: 'search', tone: 'gray' },
    { href: '/adhkar', label: 'الأذكار', hint: 'حصن المسلم والتذكير', icon: 'beads', tone: 'mint' },
  ];

  return (
    <section className="flex flex-col gap-6 pt-2">
      <div className="flex items-start justify-between gap-3">
        
        <div className="min-w-0">
          <HomeDate />
          {/* Fixed size here (not the reading size setting, which can go up to 32px). */}
          <h1 className="mt-1 font-[family-name:var(--font-quran)] text-2xl leading-[1.8] font-bold text-[var(--accent)] mb-[18px]">
            بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ
          </h1>
          <p className="text-sm text-[var(--muted)]">اقرأ القرآن، وابحث فيه بالكتابة أو بصوتك، وتابع ختمتك.</p>
        </div>
        {/* Decorative mosque badge (design). */}
        <span aria-hidden className="mt-3 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--accent)]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
            <path d="M12 3v1.5M8 10a4 4 0 0 1 8 0M7 10h10v10H7zM3 20V12l2-2 2 2M21 20v-8l-2-2-2 2M3 20h18M10.5 20v-3a1.5 1.5 0 0 1 3 0v3" />
          </svg>
        </span>
      </div>

      <HomeCards suras={info} />

      <div>
        <h2 className="mb-3 text-lg font-bold text-[var(--accent)]">الخدمات الرئيسية</h2>
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {tiles.map((t, i) => (
            <Link
              key={t.href}
              href={t.href}
              className={`${i === tiles.length - 1 && tiles.length % 2 === 1 ? 'col-span-2 ' : ''}${TONE[t.tone].bg} ui-reveal group flex min-h-32 flex-col justify-between gap-4 rounded-[1.25rem] p-4 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]`}
            >
              <span className={`${TONE[t.tone].icon} flex h-11 w-11 items-center justify-center self-center rounded-full text-[var(--accent)]`}>
                <Icon name={t.icon} className="h-5 w-5" />
              </span>
              <span className="flex flex-col items-center text-center">
                <span className="block text-lg font-bold text-[var(--fg)]">{t.label}</span>
                <span className="mt-0.5 block text-xs text-[var(--muted)]">{t.hint}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
