import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
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
      {/* Title row (same as a topic page): round back button, «الأذكار» in gold, the title. */}
      <header className="flex items-center gap-3">
        <Link
          href="/adhkar"
          aria-label="الأذكار"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--fg)] hover:text-[var(--accent)]"
        >
          <Icon name="back" className="h-5 w-5" />
        </Link>
        <div className="min-w-0">
          <p className="truncate text-xs text-[var(--gold)]">الأذكار</p>
          <h1 className="truncate text-lg font-bold">{data.category.title}</h1>
        </div>
      </header>
      {data.items.length === 0 ? (
        <div className="ui-elevated px-6 py-10 text-center" role="status">
          <p className="font-semibold">مفيش أذكار في القسم ده.</p>
        </div>
      ) : (
        <AdhkarCategoryClient category={data.category} items={data.items} />
      )}
    </article>
  );
}
