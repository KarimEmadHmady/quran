import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageHeader } from '@/components/AppChrome';
import { SearchClient } from './SearchClient';

export const metadata: Metadata = { title: 'البحث في القرآن' };

export default function SearchPage() {
  return (
    <section>
      <PageHeader title="البحث" />
      <Suspense fallback={<p className="text-[var(--muted)]">…</p>}>
        <SearchClient />
      </Suspense>
    </section>
  );
}
