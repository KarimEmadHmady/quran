'use client';

import { create } from 'zustand';

/** Which bottom sheet is open (pure UI state, never persisted). */
type Sheet = 'settings' | 'cart' | null;
/** Reading layout: one ayah card below another, or continuous Mushaf-style text. */
export type AyahView = 'vertical' | 'mushaf';

export const useUiStore = create<{
  sheet: Sheet;
  open: (s: Exclude<Sheet, null>) => void;
  close: () => void;
  ayahView: AyahView;
  setAyahView: (v: AyahView) => void;
  /** Cart ayahs whose "Include Tafsir" box is UNchecked (checked by default for every ayah). */
  cartTafsirOff: number[];
  toggleCartTafsir: (ayahId: number) => void;
}>()((set) => ({
  sheet: null,
  open: (sheet) => set({ sheet }),
  close: () => set({ sheet: null }),
  ayahView: 'vertical',
  setAyahView: (ayahView) => set({ ayahView }),
  cartTafsirOff: [],
  toggleCartTafsir: (ayahId) =>
    set((s) => ({
      cartTafsirOff: s.cartTafsirOff.includes(ayahId)
        ? s.cartTafsirOff.filter((id) => id !== ayahId)
        : [...s.cartTafsirOff, ayahId],
    })),
}));
