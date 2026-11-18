import type { Metadata } from 'next';
import { PageHeader } from '@/components/AppChrome';
import { getAdhkarCategories, getAdhkarReminders } from '@/lib/serverApi';
import { AdhkarHomeClient } from './AdhkarHomeClient';

export const metadata: Metadata = { title: 'الأذكار' };
export const dynamic = 'force-dynamic';

/** /adhkar — categories in the source order, search, favourites, recent and reminders. */
export default async function AdhkarPage() {
  const [categories, reminders] = await Promise.all([
    getAdhkarCategories(),
    // Reminders are optional: the page still works without them.
    getAdhkarReminders().catch(() => []),
  ]);
  return (
    <section>
      <PageHeader title="الأذكار" />
      {categories.length === 0 ? (
        <div className="ui-card px-6 py-10 text-center" role="status">
          <p className="font-semibold">لا يوجد أذكار متاحة حاليا .</p>
        </div>
      ) : (
        <AdhkarHomeClient categories={categories} reminders={reminders} />
      )}
    </section>
  );
}
