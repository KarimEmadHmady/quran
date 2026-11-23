import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SearchClient } from './SearchClient';

export const metadata: Metadata = { title: 'البحث في القرآن' };

export default function SearchPage() {
  return (
    <section>
      {/* The title row (with the search mode chip) is rendered by SearchClient. */}
      <Suspense fallback={<p className="text-[var(--muted)]">…</p>}>
        <SearchClient />
      </Suspense>
    </section>
  );
}
