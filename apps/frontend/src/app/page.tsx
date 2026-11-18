import Link from 'next/link';
import { HomeCards } from '@/components/HomeCards';
import { Icon, type IconName } from '@/components/Icon';
import { getSuras } from '@/lib/serverApi';

export const dynamic = 'force-dynamic';

const TILES: { href: string; label: string; icon: IconName }[] = [
  { href: '/surah', label: 'قراءة القرآن', icon: 'book' },
  { href: '/topics', label: 'المواضيع', icon: 'grid' },
  { href: '/search', label: 'البحث', icon: 'search' },
  { href: '/khatma', label: 'الختمة', icon: 'calendar' },
  { href: '/adhkar', label: 'الأذكار', icon: 'beads' },
];

export default async function HomePage() {
  // Names for the "continue reading" card; the page still works if the API is down.
  const suras = await getSuras().catch(() => []);
  const names = Object.fromEntries(suras.map((s) => [s.number, s.nameAr]));
  return (
    // Exactly the height left between the top bar (+1px border), the frame's top padding (pt-4)
    // and its bottom room (--frame-pb): the tiles grid takes whatever is left, so the page never
    // overflows when the content fits, and only scrolls on screens too short for it.
    <section
      className="flex flex-col gap-3"
      style={{ minHeight: 'calc(100svh - var(--topbar-h) - 1px - 1rem - var(--frame-pb))' }}
    >
      <div className="text-center">
        {/* Fixed size here (not the reading size setting, which can go up to 32px). */}
        <h1 className="font-[family-name:var(--font-quran)] text-2xl leading-[1.7]">بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</h1>
        <p className="text-xs text-[var(--muted)]">اقرأ القرآن، وابحث فيه بالكتابة أو بصوتك، وتابع ختمتك.</p>
      </div>
      <HomeCards suraNames={names} />
      {/* An odd last tile (الأذكار) spans the whole row. */}
      <div className="grid max-h-[28rem] flex-1 auto-rows-fr grid-cols-2 gap-2.5">
        {TILES.map((t, i) => (
          <Link
            key={t.href}
            href={t.href}
            className={`${i === TILES.length - 1 && TILES.length % 2 === 1 ? 'col-span-2 ' : ''}ui-card flex min-h-14 flex-col items-center justify-center gap-1.5 py-2 hover:border-[var(--accent)]`}
          >
            <Icon name={t.icon} className="h-6 w-6" />
            <span className="text-sm font-semibold">{t.label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
