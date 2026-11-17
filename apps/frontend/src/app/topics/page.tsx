import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/AppChrome';
import { Icon } from '@/components/Icon';
import type { TopicNode } from '@/lib/quran';
import { getTopicTree } from '@/lib/serverApi';

export const metadata: Metadata = { title: 'المواضيع' };
export const dynamic = 'force-dynamic';

/** Design rows: folder icon (has sub-topics) or document icon, title, chevron. */
function Tree({ nodes, nested = false }: { nodes: TopicNode[]; nested?: boolean }) {
  return (
    <ul className={nested ? 'mt-1 space-y-1 border-s border-[var(--border)] ms-6 ps-3' : 'ui-card divide-y divide-[var(--border)] overflow-hidden'}>
      {nodes.map((t) => {
        const hasChildren = Boolean(t.children && t.children.length > 0);
        return (
          <li key={t.id} className={nested ? '' : 'py-1'}>
            <Link href={`/topics/${t.id}`} className="flex items-center gap-3 rounded-xl px-4 py-3 hover:bg-[var(--surface-2)]">
              <Icon name={hasChildren ? 'folder' : 'file'} className="h-5 w-5 shrink-0 text-[var(--muted)]" />
              <span className="flex-1 font-semibold">{t.title}</span>
              <Icon name="chevron" className="h-4 w-4 text-[var(--muted)]" />
            </Link>
            {hasChildren && <Tree nodes={t.children!} nested />}
          </li>
        );
      })}
    </ul>
  );
}

/** spec §2: topics (the API already hides banned topics and their subtrees). */
export default async function TopicsPage() {
  const tree = await getTopicTree();
  return (
    <section>
      <PageHeader title="المواضيع" />
      {tree.length === 0 ? <p className="text-[var(--muted)]">مفيش مواضيع متاحة.</p> : <Tree nodes={tree} />}
    </section>
  );
}
