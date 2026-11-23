import type { Metadata } from 'next';
import { getSuras } from '@/lib/serverApi';
import { SuraListClient } from './SuraListClient';

export const metadata: Metadata = { title: 'السور' };
// Read from the API at request time (cached 1h), never at build time.
export const dynamic = 'force-dynamic';

export default async function SurasPage() {
  const suras = await getSuras();
  return (
    <section >

      {suras.length === 0 ? (
        <>
          <h1 className="mb-4 text-xl font-bold text-[var(--accent)]">سور القرآن الكريم</h1>
          <p className="text-[var(--muted)]">مفيش سور متاحة.</p>
        </>
      ) : (
        <SuraListClient suras={suras} />
      )}
    </section>
  );
}
