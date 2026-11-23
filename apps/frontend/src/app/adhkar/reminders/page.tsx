import type { Metadata } from 'next';
import { PageHeader } from '@/components/AppChrome';
import { getAdhkarReminders } from '@/lib/serverApi';
import { RemindersClient } from './RemindersClient';

export const metadata: Metadata = { title: 'تذكير الأذكار' };
export const dynamic = 'force-dynamic';

/** /adhkar/reminders — enable / time each reminder slot, notification permission, limits. */
export default async function AdhkarRemindersPage() {
  const reminders = await getAdhkarReminders();
  return (
    <section>
      <PageHeader title="تذكير الأذكار" backHref="/adhkar" backLabel="الأذكار" />
      {reminders.length === 0 ? (
        <div className="ui-elevated px-6 py-10 text-center" role="status">
          <p className="font-semibold">التذكير مش متاح دلوقتي.</p>
        </div>
      ) : (
        <RemindersClient reminders={reminders} />
      )}
    </section>
  );
}
