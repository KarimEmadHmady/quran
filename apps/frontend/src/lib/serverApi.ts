import 'server-only';
import type { AdhkarCategory, Dhikr, ReminderDefinition } from './adhkarApi';
import type { Ayah, Pagination, SuraInfo, TopicNode } from './quran';

/**
 * Server-side reads for the reading pages (Server Components). Content is static, so answers
 * are cached for an hour (Next data cache). 404 -> null; anything else non-2xx throws and
 * the route's error boundary shows a retry.
 */
const BASE = (process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(
  /\/+$/,
  '',
);
const REVALIDATE_SECONDS = 3600;
/** The API's max page size (claude.md 11.3). */
const PAGE_LIMIT = 100;

export class ApiUnavailableError extends Error {}

async function get<T>(path: string): Promise<T | null> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      headers: { Accept: 'application/json' },
      next: { revalidate: REVALIDATE_SECONDS },
    });
  } catch {
    throw new ApiUnavailableError('API unreachable');
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new ApiUnavailableError(`API ${res.status}`);
  return (await res.json()) as T;
}

export async function getSuras(): Promise<SuraInfo[]> {
  return (await get<{ data: SuraInfo[] }>('/suras'))?.data ?? [];
}

/** A sura with ALL its ayahs (Al-Baqarah = 3 pages of 100). null when it does not exist. */
export async function getSura(number: number): Promise<{ sura: SuraInfo; ayahs: Ayah[] } | null> {
  type Page = { sura: SuraInfo; ayahs: Ayah[]; pagination: Pagination };
  const first = await get<Page>(`/suras/${number}?page=1&limit=${PAGE_LIMIT}`);
  if (!first) return null;
  const rest = await Promise.all(
    Array.from({ length: first.pagination.totalPages - 1 }, (_, i) =>
      get<Page>(`/suras/${number}?page=${i + 2}&limit=${PAGE_LIMIT}`),
    ),
  );
  return { sura: first.sura, ayahs: [first, ...rest].flatMap((p) => p?.ayahs ?? []) };
}

export async function getTopicTree(): Promise<TopicNode[]> {
  return (await get<{ data: TopicNode[] }>('/topics?tree=true'))?.data ?? [];
}

export async function getTopic(
  id: number,
  page: number,
): Promise<{ topic: TopicNode; ayahs: Ayah[]; pagination: Pagination } | null> {
  return get(`/topics/${id}?page=${page}&limit=50`);
}

// ------------------------------------------------------------------ adhkar

export async function getAdhkarCategories(): Promise<AdhkarCategory[]> {
  return (await get<{ data: AdhkarCategory[] }>('/adhkar/categories'))?.data ?? [];
}

/** One category with all its items (no pagination: categories are short). null = not found. */
export async function getAdhkarCategory(id: number): Promise<{ category: AdhkarCategory; items: Dhikr[] } | null> {
  return get(`/adhkar/categories/${id}`);
}

/** Time-of-day reminder slots (morning, evening, sleep, wake) and their categories. */
export async function getAdhkarReminders(): Promise<ReminderDefinition[]> {
  return (await get<{ data: ReminderDefinition[] }>('/adhkar/reminders'))?.data ?? [];
}
