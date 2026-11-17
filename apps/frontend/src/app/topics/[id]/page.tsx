import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/AppChrome';
import { AyahList } from '@/components/AyahList';
import { parseIntParam, parsePageParam } from '@/lib/routeParams';
import { getSuras, getTopic } from '@/lib/serverApi';

export const dynamic = 'force-dynamic';

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
  const [data, suras] = await Promise.all([getTopic(id, page), getSuras()]);
  if (!data) notFound();
  const { topic, ayahs, pagination } = data;
  const names = Object.fromEntries(suras.map((s) => [s.number, s.nameAr]));

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
    </section>
  );
}
