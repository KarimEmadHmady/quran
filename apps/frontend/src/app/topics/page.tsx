import type { Metadata } from 'next';
import { getTopicTree } from '@/lib/serverApi';
import { TopicsClient } from './TopicsClient';

export const metadata: Metadata = { title: 'المواضيع' };
export const dynamic = 'force-dynamic';

/** spec §2: topics (the API already hides banned topics and their subtrees), with a live search. */
export default async function TopicsPage() {
  const tree = await getTopicTree();
  return (
    <section>
      {tree.length === 0 ? (
        <>
          <h1 className="mb-4 text-xl font-bold text-[var(--accent)]">المواضيع</h1>
          <p className="text-[var(--muted)]">مفيش مواضيع متاحة.</p>
        </>
      ) : (
        <TopicsClient tree={tree} />
      )}
    </section>
  );
}
