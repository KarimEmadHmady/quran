import type { Metadata } from 'next';
import { PageHeader } from '@/components/AppChrome';
import { FavoritesClient } from './FavoritesClient';

export const metadata: Metadata = { title: 'الأذكار المفضلة' };

/** /adhkar/favorites — the favourites are on this device, so the list is built in the browser. */
export default function AdhkarFavoritesPage() {
  return (
    <section>
      <PageHeader title="الأذكار المفضلة" backHref="/adhkar" backLabel="الأذكار" />
      <FavoritesClient />
    </section>
  );
}
