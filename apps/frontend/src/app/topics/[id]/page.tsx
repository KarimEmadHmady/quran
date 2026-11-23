import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AyahList } from '@/components/AyahList';
import { Icon } from '@/components/Icon';
import { relatedTopics, type RelatedReason } from '@/lib/relatedTopics';
import type { TopicNode } from '@/lib/quran';
import { parseIntParam, parsePageParam } from '@/lib/routeParams';
import { getSuras, getTopic, getTopicTree } from '@/lib/serverApi';

export const dynamic = 'force-dynamic';

const findTopic = (nodes: TopicNode[], id: number): TopicNode | null => {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = findTopic(n.children ?? [], id);
    if (hit) return hit;
  }
  return null;
};

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
  // Parent title (small gold line above the title, design) from the public tree.
  const parent = topic.parentId ? findTopic(tree, topic.parentId) : null;
  const pageBtn =
    'inline-flex items-center rounded-full bg-[var(--surface)] px-4 py-2 font-semibold text-[var(--accent)] shadow-[var(--shadow-card)] hover:bg-[var(--surface-2)]';

  return (
    <section className="space-y-4">
      {/* Title row (design): back button, parent topic in gold, the title. */}
      <header className="flex items-center gap-3">
        <Link
          href="/topics"
          aria-label="المواضيع"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--fg)] hover:text-[var(--accent)]"
        >
          <Icon name="back" className="h-5 w-5" />
        </Link>
        <div className="min-w-0">
          {parent && <p className="truncate text-xs text-[var(--gold)]">{parent.title}</p>}
          <p className="truncate text-lg font-bold">{topic.title}</p>
        </div>
      </header>

      {/* Green hero (design). */}
      <div className="relative overflow-hidden rounded-[1.5rem] bg-[var(--hero)] px-5 py-6 text-[var(--hero-fg)] shadow-[var(--shadow-card)]">
        {/* eslint-disable-next-line @next/next/no-img-element -- decorative static image */}
        <img
          src="/geometry-bg.png"
          alt=""
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 h-36 w-auto select-none opacity-60"
        />
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs text-[var(--hero-muted)]">
            <Icon name="book" className="h-3.5 w-3.5" />
            {parent ? parent.title : 'المواضيع'}
          </span>
          <h1 className="mt-3 text-2xl font-bold leading-snug">{topic.title}</h1>
          {topic.description && <p className="mt-2 text-sm leading-7 text-white/75">{topic.description}</p>}
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1">
              <Icon name="file" className="h-3.5 w-3.5" />
              {pagination.total} آية
            </span>
            {pagination.totalPages > 1 && (
              <span className="inline-flex items-center rounded-full border border-white/20 px-3 py-1">
                صفحة {page} من {pagination.totalPages}
              </span>
            )}
          </div>
        </div>
      </div>
      {ayahs.length === 0 ? (
        <p className="text-[var(--muted)]">{pagination.total === 0 ? 'مفيش آيات في الموضوع ده.' : 'مفيش آيات في الصفحة دي.'}</p>
      ) : (
        <AyahList ayahs={ayahs} suraNames={names} showRefs />
      )}
      {pagination.totalPages > 1 && (
        <nav className="flex items-center justify-center gap-4 text-sm" aria-label="الصفحات">
          {page > 1 && (
            <Link href={`/topics/${id}?page=${page - 1}`} className={pageBtn}>
              السابق
            </Link>
          )}
          <span>
            صفحة {page} من {pagination.totalPages}
          </span>
          {page < pagination.totalPages && (
            <Link href={`/topics/${id}?page=${page + 1}`} className={pageBtn}>
              التالي
            </Link>
          )}
        </nav>
      )}

      {related.length > 0 && (
        <section aria-labelledby="related-topics" className="pt-4">
          <h2 id="related-topics" className="mb-3 flex items-center gap-2 text-lg font-bold text-[var(--accent)]">
            <Icon name="grid" className="h-5 w-5 text-[var(--gold)]" />
            مواضيع ذات صلة
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {related.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/topics/${t.id}`}
                  className="ui-elevated flex h-full items-center gap-3 p-4 transition hover:-translate-y-0.5"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--tile-sand)] text-[var(--gold)]">
                    <Icon name={t.hasChildren ? 'folder' : 'file'} className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{t.title}</span>
                    <span className="text-xs text-[var(--muted)]">{REASON_LABEL[t.reason]}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-0.5 text-xs font-semibold text-[var(--accent)]">
                    تصفح
                    <Icon name="chevron" className="h-4 w-4" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
