import type { Metadata } from 'next';
import { PageHeader } from '@/components/AppChrome';
import { getSuras } from '@/lib/serverApi';
import { SuraListClient } from './SuraListClient';

export const metadata: Metadata = { title: 'السور' };
// Read from the API at request time (cached 1h), never at build time.
export const dynamic = 'force-dynamic';

export default async function SurasPage() {
  const suras = await getSuras();
  return (
    <section>
      <PageHeader title="سور القرآن الكريم" />
      {suras.length === 0 ? <p className="text-[var(--muted)]">مفيش سور متاحة.</p> : <SuraListClient suras={suras} />}
    </section>
  );
}
