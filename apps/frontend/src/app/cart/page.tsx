import type { Metadata } from 'next';
import { PageHeader } from '@/components/AppChrome';
import { CartClient } from './CartClient';

export const metadata: Metadata = { title: 'مختاراتي' };

export default function CartPage() {
  return (
    <section className="space-y-4">
      <PageHeader title="مختاراتي" />
      <p className="text-sm text-[var(--muted)]">راجع الآيات، أضف التفسير لو حابب، وبعدين حمّل ملف PDF.</p>
      <CartClient />
    </section>
  );
}
