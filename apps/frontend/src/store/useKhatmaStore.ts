'use client';

import { create } from 'zustand';
import { createKhatma, localDate, markRead, syncCompletion } from '@/lib/khatma';
import { STORAGE_KEYS, getItem, removeItem, setItem } from '@/lib/localStore';
import { parseKhatma, type Khatma } from '@/lib/shapes';

interface KhatmaState {
  khatma: Khatma | null;
  hydrated: boolean;
  hydrate: (today?: string) => void;
  start: (durationDays: number, today?: string) => void;
  /** "تمت القراءة": everything up to this ayah is read (no-op if already read). */
  markRead: (ayahId: number, today?: string) => void;
  /** Re-checks today's completion (e.g. when the day changes while the page is open). */
  sync: (today?: string) => void;
  reset: () => void;
}

/** spec 4.3: `quran_khatma`, logic in lib/khatma.ts (pure). Independent from the bookmark. */
export const useKhatmaStore = create<KhatmaState>()((set, get) => {
  const commit = (next: Khatma) => {
    if (next === get().khatma) return; // unchanged: no write
    setItem(STORAGE_KEYS.khatma, next);
    set({ khatma: next });
  };
  return {
    khatma: null,
    hydrated: false,
    hydrate: (today = localDate()) => {
      const k = parseKhatma(getItem<unknown>(STORAGE_KEYS.khatma, null));
      set({ khatma: k, hydrated: true });
      if (k) commit(syncCompletion(k, today));
    },
    start: (durationDays, today = localDate()) => commit(createKhatma(durationDays, today)),
    markRead: (ayahId, today = localDate()) => {
      const k = get().khatma;
      if (k) commit(markRead(k, ayahId, today));
    },
    sync: (today = localDate()) => {
      const k = get().khatma;
      if (k) commit(syncCompletion(k, today));
    },
    reset: () => {
      removeItem(STORAGE_KEYS.khatma);
      set({ khatma: null });
    },
  };
});
