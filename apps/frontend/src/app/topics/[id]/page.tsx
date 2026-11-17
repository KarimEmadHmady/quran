import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/AppChrome';
import { AyahList } from '@/components/AyahList';
import { Icon } from '@/components/Icon';
import { relatedTopics, type RelatedReason } from '@/lib/relatedTopics';
import { parseIntParam, parsePageParam } from '@/lib/routeParams';
import { getSuras, getTopic, getTopicTree } from '@/lib/serverApi';

export const dynamic = 'force-dynamic';

const REASON_LABEL: Record<RelatedReason, string> = {
  parent: 'الموضوع الأشمل',
  child: 'موضوع فرعي',
  sibling: 'من نفس القسم',
  similar: 'موضوع مشابه',
};

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = parseIntParam((await params).id, 1, 4_294_967_295);
  const data = id ? await getTopic(id, 1).catch(() => null) : null;
  return { title: data ? data.topic.title : 'موضوع' };
}

/** spec §2: the ayahs of one topic, in mushaf order, 50 per page. */
export default async function TopicPage({ params, searchParams }: Props) {
  const id = parseIntParam((await params).id, 1, 4_294_967_295);
  const page = parsePageParam((await searchParams).page);
  if (id === null || page === null) notFound();
  // The topic tree (public: banned topics already excluded) feeds «مواضيع ذات صلة»; if it fails,
  // the page still renders without that section.
  const [data, suras, tree] = await Promise.all([getTopic(id, page), getSuras(), getTopicTree().catch(() => [])]);
  if (!data) notFound();
  const { topic, ayahs, pagination } = data;
  const names = Object.fromEntries(suras.map((s) => [s.number, s.nameAr]));
  const related = relatedTopics(tree, topic.id);

  return (
    <section className="space-y-4">
      <div>
        <PageHeader title={topic.title} backHref="/topics" backLabel="المواضيع" />
        {topic.description && <p className="-mt-2 mb-1 text-[var(--muted)]">{topic.description}</p>}
        <p className="text-sm text-[var(--muted)]">{pagination.total} آية</p>
      </div>
      {ayahs.length === 0 ? (
        <p className="text-[var(--muted)]">{pagination.total === 0 ? 'مفيش آيات في الموضوع ده.' : 'مفيش آيات في الصفحة دي.'}</p>
      ) : (
        <AyahList ayahs={ayahs} suraNames={names} showRefs />
      )}
      {pagination.totalPages > 1 && (
        <nav className="flex items-center justify-center gap-4 text-sm" aria-label="الصفحات">
          {page > 1 && (
            <Link href={`/topics/${id}?page=${page - 1}`} className="ui-chip">
              السابق
            </Link>
          )}
          <span>
            صفحة {page} من {pagination.totalPages}
          </span>
          {page < pagination.totalPages && (
            <Link href={`/topics/${id}?page=${page + 1}`} className="ui-chip">
              التالي
            </Link>
          )}
        </nav>
      )}

      {related.length > 0 && (
        <section aria-labelledby="related-topics" className="border-t border-[var(--border)] pt-5">
          <h2 id="related-topics" className="mb-3 text-lg font-bold">
            مواضيع ذات صلة
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {related.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/topics/${t.id}`}
                  className="ui-card flex h-full items-center gap-3 px-4 py-3 transition hover:border-[var(--accent)]"
                >
                  <Icon name={t.hasChildren ? 'folder' : 'file'} className="h-5 w-5 shrink-0 text-[var(--muted)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{t.title}</span>
                    <span className="text-xs text-[var(--muted)]">{REASON_LABEL[t.reason]}</span>
                  </span>
                  <Icon name="chevron" className="h-4 w-4 shrink-0 text-[var(--muted)]" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
