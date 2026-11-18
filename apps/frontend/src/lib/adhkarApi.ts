/** Client for the backend's public adhkar API (/adhkar/*). Shapes mirror the backend responses. */
import { API_URL, ApiRequestError, type ApiError } from './api';

export interface AdhkarCategory {
  id: number;
  title: string;
  order: number;
  itemCount: number;
  /** Relative to the API base ("/adhkar/audio/…mp3"); use adhkarAudioSrc(). null = no audio. */
  audioUrl: string | null;
}

export interface Dhikr {
  categoryId: number;
  /** Source item id inside its category. */
  number: number;
  order: number;
  /** Exactly as in the source: never altered for display. */
  text: string;
  repeatCount: number;
  audioUrl: string | null;
}

export interface AdhkarCategoryWithItems extends AdhkarCategory {
  items: Dhikr[];
}

export interface AdhkarSearchResponse {
  query: { raw: string; normalized: string };
  categories: AdhkarCategory[];
  items: { category: { id: number; title: string }; item: Dhikr }[];
  total: number;
  truncated: boolean;
}

export type ReminderKey = 'morning' | 'evening' | 'sleep' | 'wake';

export interface ReminderDefinition {
  key: ReminderKey;
  label: string;
  categoryId: number;
  categoryTitle: string;
  /** "HH:MM" local time. */
  defaultTime: string;
  message: string;
}

export const ADHKAR_SEARCH_MAX_LENGTH = 100;

/** Absolute URL of an audio path returned by the API (only API paths are accepted). */
export function adhkarAudioSrc(path: string | null): string | null {
  return path && path.startsWith('/adhkar/audio/') ? API_URL + path : null;
}

async function get<T>(path: string, params: Record<string, string> = {}, signal?: AbortSignal): Promise<T> {
  const url = new URL(API_URL + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as Partial<ApiError> | null;
    throw new ApiRequestError(res.status, body?.message ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export const adhkarApi = {
  /** Every category with its items (used by the favourites page). */
  all: async (signal?: AbortSignal) => (await get<{ data: AdhkarCategoryWithItems[] }>('/adhkar', {}, signal)).data,
  search: (q: string, signal?: AbortSignal) =>
    get<AdhkarSearchResponse>('/adhkar/search', { q: q.slice(0, ADHKAR_SEARCH_MAX_LENGTH) }, signal),
  reminders: async (signal?: AbortSignal) =>
    (await get<{ data: ReminderDefinition[] }>('/adhkar/reminders', {}, signal)).data,
};

/** Arabic message for a failed adhkar request. */
export function adhkarErrorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) {
    if (err.status === 429) return 'طلبات كتير ورا بعض. استنى دقيقة وجرّب تاني.';
    if (err.status === 503) return 'الأذكار مش متاحة دلوقتي. جرّب بعد شوية.';
  }
  return 'حصلت مشكلة في تحميل الأذكار. جرّب تاني.';
}
