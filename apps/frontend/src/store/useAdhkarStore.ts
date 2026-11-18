'use client';

import { create } from 'zustand';
import {
  MAX_FAVORITES,
  MAX_RECENT,
  dhikrKey,
  parseFavorites,
  parseProgress,
  parseRecent,
  parseReminderPrefs,
  progressPeriod,
  type AdhkarProgress,
  type RecentCategory,
  type ReminderPref,
  type ReminderPrefs,
} from '@/lib/adhkar';
import type { ReminderKey } from '@/lib/adhkarApi';
import { STORAGE_KEYS, getItem, setItem } from '@/lib/localStore';

interface AdhkarState {
  hydrated: boolean;
  favorites: string[];
  recent: RecentCategory[];
  progress: AdhkarProgress;
  reminders: ReminderPrefs;
  hydrate: () => void;

  isFavorite: (categoryId: number, itemNumber: number) => boolean;
  toggleFavorite: (categoryId: number, itemNumber: number) => void;
  visit: (c: { id: number; title: string }) => void;

  /** Taps done for an item in the CURRENT period (0 after a new day / session). */
  count: (categoryId: number, itemNumber: number, now?: Date) => number;
  /** +1, never above `max`. */
  increment: (categoryId: number, itemNumber: number, max: number, now?: Date) => void;
  resetItem: (categoryId: number, itemNumber: number) => void;
  resetCategory: (categoryId: number) => void;

  setReminder: (key: ReminderKey, pref: ReminderPref) => void;
}

/**
 * Adhkar user data, all on this device (localStorage, like the rest of the app): favourites,
 * recently opened categories, tasbih counters and reminder settings. Independent from every
 * Quran store (cart, khatma, bookmark, audio).
 */
export const useAdhkarStore = create<AdhkarState>()((set, get) => {
  /** The category's counters, dropped when they belong to an older period. */
  const current = (categoryId: number, now = new Date()) => {
    const p = get().progress[String(categoryId)];
    return p && p.period === progressPeriod(categoryId, now) ? p.counts : {};
  };
  const saveProgress = (progress: AdhkarProgress) => {
    setItem(STORAGE_KEYS.adhkarProgress, progress);
    set({ progress });
  };

  return {
    hydrated: false,
    favorites: [],
    recent: [],
    progress: {},
    reminders: {},
    hydrate: () => {
      if (get().hydrated) return;
      set({
        hydrated: true,
        favorites: parseFavorites(getItem<unknown>(STORAGE_KEYS.adhkarFavorites, null)),
        recent: parseRecent(getItem<unknown>(STORAGE_KEYS.adhkarRecent, null)),
        progress: parseProgress(getItem<unknown>(STORAGE_KEYS.adhkarProgress, null)),
        reminders: parseReminderPrefs(getItem<unknown>(STORAGE_KEYS.adhkarReminders, null)),
      });
    },

    isFavorite: (c, n) => get().favorites.includes(dhikrKey(c, n)),
    toggleFavorite: (c, n) => {
      const key = dhikrKey(c, n);
      const favs = get().favorites;
      const favorites = favs.includes(key) ? favs.filter((f) => f !== key) : [key, ...favs].slice(0, MAX_FAVORITES);
      setItem(STORAGE_KEYS.adhkarFavorites, favorites);
      set({ favorites });
    },

    visit: ({ id, title }) => {
      const prev = get().recent;
      if (prev[0]?.id === id && prev[0]?.title === title) return; // nothing new: no write
      const recent = [{ id, title, at: new Date().toISOString() }, ...prev.filter((r) => r.id !== id)].slice(
        0,
        MAX_RECENT,
      );
      setItem(STORAGE_KEYS.adhkarRecent, recent);
      set({ recent });
    },

    count: (c, n, now) => current(c, now)[String(n)] ?? 0,
    increment: (c, n, max, now = new Date()) => {
      const counts = { ...current(c, now) };
      const done = counts[String(n)] ?? 0;
      if (done >= max) return;
      counts[String(n)] = done + 1;
      saveProgress({ ...get().progress, [String(c)]: { period: progressPeriod(c, now), counts } });
    },
    resetItem: (c, n) => {
      const counts = { ...current(c) };
      if (!(String(n) in counts)) return;
      delete counts[String(n)];
      saveProgress({ ...get().progress, [String(c)]: { period: progressPeriod(c), counts } });
    },
    resetCategory: (c) => {
      if (!(String(c) in get().progress)) return;
      const progress = { ...get().progress };
      delete progress[String(c)];
      saveProgress(progress);
    },

    setReminder: (key, pref) => {
      const reminders = { ...get().reminders, [key]: pref };
      setItem(STORAGE_KEYS.adhkarReminders, reminders);
      set({ reminders });
    },
  };
});
