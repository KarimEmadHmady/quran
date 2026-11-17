/** Client for the NestJS API (claude.md 11.3). Shapes mirror the backend responses. */

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/+$/, '');

export type MatchType =
  | 'reference'
  | 'phrase'
  | 'ordered'
  | 'all_terms'
  | 'corrected'
  | 'partial'
  | 'loose';
export type Confidence = 'high' | 'medium' | 'low';

export interface Span {
  start: number;
  end: number;
}

export interface SearchResult {
  ayahId: number;
  suraNumber: number;
  suraName: string;
  ayahNumber: number;
  ref: string;
  textUthmani: string;
  matchType: MatchType;
  score: number;
  confidence: Confidence;
  highlights: Span[];
}

export interface SearchResponse {
  query: { raw: string; normalized: string; alternatives?: string[]; selected?: string };
  corrected: { applied: true; text: string; changes: { from: string; to: string; kind: string }[] } | null;
  didYouMean: string[] | null;
  reference:
    | { status: 'ok'; ambiguous: boolean; ref: { kind: 'ayah' | 'sura'; sura: number; ayah?: number } }
    | { status: 'invalid'; reason: string; sura: number; ayah?: number; ayahCount?: number; ambiguous: boolean }
    | null;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  results: SearchResult[];
}

export interface SuggestResponse {
  query: { raw: string; normalized: string };
  suggestions: { text: string; word: string; kind: string }[];
}

export interface ApiError {
  statusCode: number;
  message: string;
}

/** Thrown for non-2xx answers; `status` 503 means the search index is still building. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function getJson<T>(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<T> {
  const url = new URL(API_URL + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as Partial<ApiError> | null;
    throw new ApiRequestError(res.status, body?.message ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

/** STT alternatives travel in one `alts` parameter, separated by "|" (claude.md 11.12). */
export const ALTS_SEPARATOR = '|';
export const MAX_ALTS = 5;
export const MAX_QUERY_LENGTH = 200;
export const MAX_QUERY_WORDS = 20;

export interface SearchParams {
  q: string;
  page?: number;
  limit?: number;
  type?: 'text' | 'voice';
  alts?: string[];
}

export function search(p: SearchParams, signal?: AbortSignal): Promise<SearchResponse> {
  const params: Record<string, string> = { q: p.q };
  if (p.page && p.page > 1) params.page = String(p.page);
  if (p.limit) params.limit = String(p.limit);
  if (p.type === 'voice') {
    params.type = 'voice';
    const alts = (p.alts ?? [])
      .map((a) => a.replaceAll(ALTS_SEPARATOR, ' ').trim())
      .filter((a) => a && a !== p.q.trim())
      .slice(0, MAX_ALTS);
    if (alts.length) params.alts = alts.join(ALTS_SEPARATOR);
  }
  return getJson('/search', params, signal);
}

export function suggest(q: string, signal?: AbortSignal): Promise<SuggestResponse> {
  return getJson('/search/suggest', { q }, signal);
}

export interface CartItem {
  ayahId: number;
  tafsirBookId?: number;
}

/** POST /export/pdf (spec 4.1): returns the PDF as a Blob. */
export async function exportPdf(items: CartItem[]): Promise<Blob> {
  const res = await fetch(`${API_URL}/export/pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/pdf' },
    body: JSON.stringify({ items }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as Partial<ApiError> | null;
    throw new ApiRequestError(res.status, body?.message ?? `HTTP ${res.status}`);
  }
  return res.blob();
}

/** Trims a query to the API limits (200 chars, 20 words) so the request never 400s. */
export function clampQuery(q: string): string {
  return q.trim().split(/\s+/).slice(0, MAX_QUERY_WORDS).join(' ').slice(0, MAX_QUERY_LENGTH);
}

export interface CartAyah {
  id: number;
  suraNumber: number;
  ayahNumber: number;
  textUthmani: string;
  suraName: string;
}

/** GET /ayahs?ids= — display data for the cart (unknown ids are simply absent). */
export async function ayahsByIds(ids: number[], signal?: AbortSignal): Promise<CartAyah[]> {
  if (ids.length === 0) return [];
  return (await getJson<{ data: CartAyah[] }>('/ayahs', { ids: ids.join(',') }, signal)).data;
}

export interface TafsirBook {
  id: number;
  name: string;
  author: string | null;
}

/** GET /tafsir-books — only confirmed books are returned by the API. */
export async function tafsirBooks(signal?: AbortSignal): Promise<TafsirBook[]> {
  return (await getJson<{ data: TafsirBook[] }>('/tafsir-books', {}, signal)).data;
}

/** Saves a Blob as a download (the PDF from /export/pdf). */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** GET /tafsirs?ayah_id= — confirmed books only (the API hides the rest). */
export async function tafsirsForAyah(
  ayahId: number,
  signal?: AbortSignal,
): Promise<{ bookId: number; bookName: string; author: string | null; content: string }[]> {
  return (
    await getJson<{ data: { bookId: number; bookName: string; author: string | null; content: string }[] }>(
      '/tafsirs',
      { ayah_id: String(ayahId) },
      signal,
    )
  ).data;
}
