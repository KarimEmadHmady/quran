import type { Metadata } from 'next';

/** /admin/*: the dashboard. Never indexed; rendered per request (session-dependent). */
export const metadata: Metadata = {
  title: { default: 'لوحة التحكم', template: '%s · لوحة التحكم' },
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
