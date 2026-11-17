import { notFound } from 'next/navigation';

/**
 * Unknown /admin/* URLs: a real 404 rendered per request (the static root 404 page would be
 * rendered with the reader chrome, which the client then hides -> hydration mismatch).
 */
export default function AdminMissing() {
  notFound();
}
