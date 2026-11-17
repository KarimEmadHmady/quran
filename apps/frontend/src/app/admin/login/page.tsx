import type { Metadata } from 'next';
import { LoginClient } from './LoginClient';

export const metadata: Metadata = { title: 'تسجيل الدخول' };

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);

/** Admin sign-in. There is deliberately no sign-up page: accounts come from `npm run seed:admin`. */
export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  return (
    <LoginClient
      next={one(sp.next)}
      notice={sp.expired === '1' ? 'expired' : sp.logged_out === '1' ? 'logged_out' : null}
    />
  );
}
