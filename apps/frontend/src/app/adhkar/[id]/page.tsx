import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/AppChrome';
import { parseIntParam } from '@/lib/routeParams';
import { getAdhkarCategory } from '@/lib/serverApi';
import { AdhkarCategoryClient } from './AdhkarCategoryClient';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = parseIntParam((await params).id, 1, 65_535);
  const data = id ? await getAdhkarCategory(id).catch(() => null) : null;
  return { title: data ? data.category.title : 'الأذكار' };
}

/** /adhkar/[id] — every dhikr of the category, in the source order, with counters and audio. */
export default async function AdhkarCategoryPage({ params }: Props) {
  const id = parseIntParam((await params).id, 1, 65_535);
  if (id === null) notFound();
  const data = await getAdhkarCategory(id);
  if (!data) notFound();

  return (
    <article className="space-y-4">
      <PageHeader title={data.category.title} backHref="/adhkar" backLabel="الأذكار" />
      {data.items.length === 0 ? (
        <div className="ui-card px-6 py-10 text-center" role="status">
          <p className="font-semibold">مفيش أذكار في القسم ده.</p>
        </div>
      ) : (
        <AdhkarCategoryClient category={data.category} items={data.items} />
      )}
    </article>
  );
}
