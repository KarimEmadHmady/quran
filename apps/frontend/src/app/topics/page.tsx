import type { Metadata } from 'next';
import { PageHeader } from '@/components/AppChrome';
import { getTopicTree } from '@/lib/serverApi';
import { TopicsClient } from './TopicsClient';

export const metadata: Metadata = { title: 'المواضيع' };
export const dynamic = 'force-dynamic';

/** spec §2: topics (the API already hides banned topics and their subtrees), with a live search. */
export default async function TopicsPage() {
  const tree = await getTopicTree();
  return (
    <section>
      <PageHeader title="المواضيع" />
      {tree.length === 0 ? <p className="text-[var(--muted)]">مفيش مواضيع متاحة.</p> : <TopicsClient tree={tree} />}
    </section>
  );
}
