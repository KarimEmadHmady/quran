'use client';

import { create } from 'zustand';
import { STORAGE_KEYS, getItem, setItem } from '@/lib/localStore';
import {
  FONT_SIZE_DEFAULT,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  parseSettings,
  type Script,
  type Settings,
  type Theme,
} from '@/lib/shapes';

interface SettingsState {
  fontSize: number;
  /** null = follow the device until the user picks one (claude.md 11.15 decision 3). */
  theme: Theme | null;
  script: Script;
  hydrated: boolean;
  hydrate: () => void;
  setFontSize: (px: number) => void;
  setTheme: (t: Theme) => void;
  setScript: (s: Script) => void;
}

export function deviceTheme(): Theme {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export const clampFontSize = (px: number) =>
  Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(Number.isFinite(px) ? px : FONT_SIZE_DEFAULT)));

/**
 * spec 4.2: `quran_settings` = { fontSize, theme, script }. Nothing is written until the user
 * changes a setting; the stored object always has the exact spec shape (a theme that was still
 * "follow the device" is saved as the device's current value).
 */
export const useSettingsStore = create<SettingsState>()((set, get) => {
  const save = () => {
    const { fontSize, theme, script } = get();
    const value: Settings = { fontSize, theme: theme ?? deviceTheme(), script };
    setItem(STORAGE_KEYS.settings, value);
  };
  return {
    fontSize: FONT_SIZE_DEFAULT,
    theme: null,
    script: 'uthmani',
    hydrated: false,
    hydrate: () => {
      const saved = parseSettings(getItem<unknown>(STORAGE_KEYS.settings, null));
      set({ ...(saved ?? {}), hydrated: true });
    },
    setFontSize: (px) => {
      set({ fontSize: clampFontSize(px) });
      save();
    },
    setTheme: (theme) => {
      set({ theme });
      save();
    },
    setScript: (script) => {
      set({ script });
      save();
    },
  };
});

/** The theme actually shown. */
export function resolvedTheme(theme: Theme | null): Theme {
  return theme ?? deviceTheme();
}
