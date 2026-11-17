'use client';

import { create } from 'zustand';
import { STORAGE_KEYS, getItem, setItem } from '@/lib/localStore';
import { parseBookmark, type Bookmark } from '@/lib/shapes';

interface BookmarkState {
  bookmark: Bookmark | null;
  hydrated: boolean;
  hydrate: () => void;
  /** Saves the reading position; independent from the khatma (claude.md 11.15). */
  save: (b: Omit<Bookmark, 'updatedAt'>, now?: Date) => void;
}

/** spec 4.7: one bookmark (`quran_bookmark`), updated automatically while reading. */
export const useBookmarkStore = create<BookmarkState>()((set, get) => ({
  bookmark: null,
  hydrated: false,
  hydrate: () => set({ bookmark: parseBookmark(getItem<unknown>(STORAGE_KEYS.bookmark, null)), hydrated: true }),
  save: ({ ayahId, suraNumber, ayahNumber }, now = new Date()) => {
    const prev = get().bookmark;
    if (prev?.ayahId === ayahId) return; // nothing new: no write
    const bookmark: Bookmark = { ayahId, suraNumber, ayahNumber, updatedAt: now.toISOString() };
    if (!parseBookmark(bookmark)) return;
    setItem(STORAGE_KEYS.bookmark, bookmark);
    set({ bookmark });
  },
}));
