import type { Metadata } from 'next';
import { getSuras } from '@/lib/serverApi';
import { KhatmaClient } from './KhatmaClient';

export const metadata: Metadata = { title: 'الختمة' };
export const dynamic = 'force-dynamic';

/** spec 4.3: daily wird / khatma plan, all client-side (sura list only for names). */
export default async function KhatmaPage() {
  const suras = await getSuras();
  return (
    <section>
      <KhatmaClient suras={suras} />
    </section>
  );
}
