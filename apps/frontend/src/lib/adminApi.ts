/**
 * Admin dashboard client (Phase 6). The session is the backend's httpOnly cookie
 * (qa_admin_session, Path=/admin): the browser sends it with `credentials: 'include'`; this
 * code never sees or stores a token. A 401 on any call except login calls the registered
 * handler (the dashboard layout sends the user to /admin/login?expired=1).
 */
import { API_URL } from './api';

export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export async function adminFetch<T>(
  path: string,
  init: { method?: Method; body?: unknown; query?: Record<string, string | number | undefined>; signal?: AbortSignal } = {},
): Promise<T> {
  const url = new URL(API_URL + path);
  for (const [k, v] of Object.entries(init.query ?? {})) {
    if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  }
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? 'GET',
      credentials: 'include',
      signal: init.signal,
      headers: {
        Accept: 'application/json',
        ...(init.body !== undefined && { 'Content-Type': 'application/json' }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new AdminApiError(0, 'network');
  }
  if (res.status === 401 && path !== '/admin/auth/login' && path !== '/admin/auth/me') onUnauthorized?.();
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: unknown } | null;
    throw new AdminApiError(res.status, typeof body?.message === 'string' ? body.message : `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ------------------------------------------------------------------ shapes (backend responses)

export interface AdminProfile {
  id: number;
  email: string;
  name: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AdminStats {
  suras: number;
  ayahs: number;
  topics: { total: number; banned: number; hidden: number };
  topicLinks: number;
  tafsirBooks: { total: number; visible: number };
  tafsirs: number;
}

export interface AdminSura {
  number: number;
  nameAr: string;
  nameEn: string;
  ayahCount: number;
  revelationPlace: string | null;
}

export interface AdminTopic {
  id: number;
  parentId: number | null;
  title: string;
  description: string | null;
  isBanned: boolean;
  hidden: boolean;
  ayahCount: number;
  childrenCount: number;
}

export interface AdminTopicDetails extends AdminTopic {
  parent: { id: number; title: string } | null;
  children: { id: number; title: string; isBanned: boolean }[];
}

export interface AdminAyah {
  id: number;
  suraNumber: number;
  ayahNumber: number;
  textUthmani: string;
  textSimple: string;
  juz: number | null;
  page: number | null;
}

export interface AdminTafsirBook {
  id: number;
  name: string;
  author: string | null;
  hidden: boolean;
  tafsirCount: number;
}

export interface AdminTafsirEntry {
  bookId: number;
  bookName: string;
  hidden: boolean;
  content: string;
}

export interface SearchIndexStatus {
  state: string;
  ready: boolean;
}

// ------------------------------------------------------------------ Quran audio

export interface AudioSyncJob {
  id: number;
  kind: 'reciters' | 'audio';
  status: 'running' | 'completed' | 'failed' | 'interrupted';
  recitersTotal: number;
  recitersDone: number;
  currentReciter: string | null;
  itemsTotal: number;
  itemsDone: number;
  missingCount: number;
  errorCount: number;
  pendingReciters: string[];
  errors: { at: string; reciter: string | null; message: string }[];
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
  resumable: boolean;
  summary?: { total: number; added: number; updated: number; markedUnavailable: number; verified: number; failed: { identifier: string; error: string }[] };
}

export interface AudioSyncStatus {
  running: AudioSyncJob | null;
  lastReciterJob: AudioSyncJob | null;
  lastAudioJob: AudioSyncJob | null;
}

export interface AdminReciter {
  identifier: string;
  name: string;
  englishName: string | null;
  language: string;
  format: string;
  type: string;
  bitrate: number | null;
  secondaryBitrates: number[];
  isAvailable: boolean;
  isActive: boolean;
  verified: boolean;
  verifiedAt: string | null;
  verificationError: string | null;
  lastSyncedAt: string | null;
  audio: { available: number; missing: number };
}

export interface AudioOverview {
  schemaReady: boolean;
  reciters: { total: number; available: number; active: number; verified: number };
  ayahs: number;
  audio: { total: number; available: number; missing: number; expected: number };
  lastSyncAt: string | null;
  sync: AudioSyncStatus;
  reciterList: AdminReciter[];
}

export interface AdminEdition {
  identifier: string;
  name: string;
  englishName: string | null;
  language: string;
  format: string;
  type: string;
  compatible: boolean;
}

/** Full-sura reciter (one MP3 per sura; separate catalogue from AdminReciter). */
export interface AdminSurahReciter {
  identifier: string;
  apiIdentifier: string | null;
  name: string | null;
  englishName: string | null;
  bitrate: number;
  bitrates: number[];
  surahCount: number;
  missingSurahs: number[];
  isAvailable: boolean;
  isActive: boolean;
  lastSyncedAt: string | null;
}

export interface AdminSurahReciters {
  schemaReady: boolean;
  total: number;
  available: number;
  active: number;
  complete: number;
  lastSyncAt: string | null;
  data: AdminSurahReciter[];
}

export interface SurahReciterSyncResult {
  total: number;
  added: number;
  updated: number;
  markedUnavailable: number;
  withoutName: number;
  incomplete: number;
}

// ------------------------------------------------------------------ calls

export const adminApi = {
  login: (email: string, password: string) =>
    adminFetch<{ admin: AdminProfile }>('/admin/auth/login', { method: 'POST', body: { email, password } }),
  logout: () => adminFetch<void>('/admin/auth/logout', { method: 'POST' }),
  me: (signal?: AbortSignal) => adminFetch<AdminProfile>('/admin/auth/me', { signal }),

  stats: (signal?: AbortSignal) => adminFetch<AdminStats>('/admin/stats', { signal }),
  reindex: () => adminFetch<SearchIndexStatus>('/admin/search/reindex', { method: 'POST' }),

  suras: (signal?: AbortSignal) => adminFetch<{ data: AdminSura[] }>('/admin/suras', { signal }),
  updateSura: (number: number, body: { nameAr?: string; nameEn?: string }) =>
    adminFetch<{ sura: AdminSura; reindex: 'done' | 'failed' }>(`/admin/suras/${number}`, { method: 'PATCH', body }),

  topics: (query: { q?: string; status?: string; page?: number; limit?: number }, signal?: AbortSignal) =>
    adminFetch<{ data: AdminTopic[]; pagination: PageMeta }>('/admin/topics', { query, signal }),
  topic: (id: number, signal?: AbortSignal) => adminFetch<AdminTopicDetails>(`/admin/topics/${id}`, { signal }),
  createTopic: (body: { title: string; description?: string | null; parentId?: number | null }) =>
    adminFetch<AdminTopicDetails>('/admin/topics', { method: 'POST', body }),
  updateTopic: (
    id: number,
    body: { title?: string; description?: string | null; parentId?: number | null; isBanned?: boolean },
  ) => adminFetch<AdminTopicDetails>(`/admin/topics/${id}`, { method: 'PATCH', body }),
  deleteTopic: (id: number) => adminFetch<void>(`/admin/topics/${id}`, { method: 'DELETE' }),
  topicAyahs: (id: number, page: number, signal?: AbortSignal) =>
    adminFetch<{ data: AdminAyah[]; pagination: PageMeta }>(`/admin/topics/${id}/ayahs`, {
      query: { page, limit: 20 },
      signal,
    }),
  linkAyahs: (id: number, ayahIds: number[]) =>
    adminFetch<{ added: number[]; skipped: number[] }>(`/admin/topics/${id}/ayahs`, {
      method: 'POST',
      body: { ayahIds },
    }),
  unlinkAyah: (id: number, ayahId: number) =>
    adminFetch<void>(`/admin/topics/${id}/ayahs/${ayahId}`, { method: 'DELETE' }),

  ayahs: (sura: number, page: number, signal?: AbortSignal) =>
    adminFetch<{ sura: AdminSura; data: AdminAyah[]; pagination: PageMeta }>('/admin/ayahs', {
      query: { sura, page, limit: 50 },
      signal,
    }),
  /** Up to 100 "sura:ayah" references in one request. */
  lookupAyahs: (refs: string[], signal?: AbortSignal) =>
    adminFetch<{ data: AdminAyah[]; missing: string[] }>('/admin/ayahs/lookup', {
      query: { refs: refs.join(',') },
      signal,
    }),

  audioOverview: (signal?: AbortSignal) => adminFetch<AudioOverview>('/admin/quran-audio/overview', { signal }),
  audioSyncStatus: (signal?: AbortSignal) => adminFetch<AudioSyncStatus>('/admin/quran-audio/sync/status', { signal }),
  audioEditions: (signal?: AbortSignal) => adminFetch<{ data: AdminEdition[] }>('/admin/quran-audio/editions', { signal }),
  syncReciters: (force: boolean) =>
    adminFetch<AudioSyncJob>('/admin/quran-audio/sync/reciters', { method: 'POST', body: { force } }),
  syncAudio: (body: { resume?: boolean; reciters?: string[] }) =>
    adminFetch<AudioSyncJob>('/admin/quran-audio/sync/audio', { method: 'POST', body }),
  setReciterActive: (identifier: string, isActive: boolean) =>
    adminFetch<AdminReciter>(`/admin/quran-audio/reciters/${encodeURIComponent(identifier)}`, {
      method: 'PATCH',
      body: { isActive },
    }),

  surahReciters: (signal?: AbortSignal) =>
    adminFetch<AdminSurahReciters>('/admin/quran-audio/surah-reciters', { signal }),
  syncSurahReciters: () =>
    adminFetch<SurahReciterSyncResult>('/admin/quran-audio/sync/surah-reciters', { method: 'POST' }),
  setSurahReciterActive: (identifier: string, isActive: boolean) =>
    adminFetch<AdminSurahReciter>(`/admin/quran-audio/surah-reciters/${encodeURIComponent(identifier)}`, {
      method: 'PATCH',
      body: { isActive },
    }),

  tafsirBooks: (signal?: AbortSignal) => adminFetch<{ data: AdminTafsirBook[] }>('/admin/tafsir-books', { signal }),
  updateTafsirBook: (id: number, body: { name?: string; author?: string | null }) =>
    adminFetch<AdminTafsirBook>(`/admin/tafsir-books/${id}`, { method: 'PATCH', body }),
  tafsirs: (ayahId: number, signal?: AbortSignal) =>
    adminFetch<{ ayah: AdminAyah; data: AdminTafsirEntry[] }>('/admin/tafsirs', {
      query: { ayah_id: ayahId },
      signal,
    }),
};
