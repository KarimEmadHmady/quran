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
];

export default async function HomePage() {
  // Names for the "continue reading" card; the page still works if the API is down.
  const suras = await getSuras().catch(() => []);
  const names = Object.fromEntries(suras.map((s) => [s.number, s.nameAr]));
  return (
    <section className="space-y-5">
      <div className="space-y-1 text-center">
        <h1 className="quran-text">بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</h1>
        <p className="text-sm text-[var(--muted)]">اقرأ القرآن، وابحث فيه بالكتابة أو بصوتك، وتابع ختمتك.</p>
      </div>
      <HomeCards suraNames={names} />
      <div className="grid grid-cols-2 gap-3">
        {TILES.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="ui-card flex flex-col items-center justify-center gap-3 py-7 hover:border-[var(--accent)]"
          >
            <Icon name={t.icon} className="h-7 w-7" />
            <span className="text-sm font-semibold">{t.label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
