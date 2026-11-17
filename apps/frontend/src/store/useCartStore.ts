'use client';

import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';
import type { CartItem } from '@/lib/api';
import { STORAGE_KEYS, getItem, removeItem, setItem } from '@/lib/localStore';

/** Max ayahs per export (matches the backend limit of POST /export/pdf). */
export const CART_MAX_ITEMS = 100;

interface CartState {
  items: CartItem[];
  add: (ayahId: number, tafsirBookId?: number) => void;
  remove: (ayahId: number) => void;
  /** Attach (or with undefined, drop) a tafsir book for one item. */
  setTafsir: (ayahId: number, tafsirBookId: number | undefined) => void;
  clear: () => void;
}

type Persisted = Pick<CartState, 'items'>;

const isCartItem = (i: unknown): i is CartItem =>
  typeof i === 'object' &&
  i !== null &&
  Number.isInteger((i as CartItem).ayahId) &&
  (i as CartItem).ayahId > 0 &&
  ((i as CartItem).tafsirBookId === undefined || Number.isInteger((i as CartItem).tafsirBookId));

/**
 * spec 4.1 / §3: `quran_cart` holds exactly `{ ayahId; tafsirBookId? }[]` (no zustand wrapper),
 * read and written only through lib/localStore. Corrupt entries are dropped on load.
 */
const cartStorage: PersistStorage<Persisted> = {
  getItem: (name) => {
    const raw = getItem<unknown>(name, []);
    const items = Array.isArray(raw) ? raw.filter(isCartItem).slice(0, CART_MAX_ITEMS) : [];
    return { state: { items }, version: 0 };
  },
  setItem: (name, value) => setItem(name, value.state.items),
  removeItem: (name) => removeItem(name),
};

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      add: (ayahId, tafsirBookId) =>
        set((s) =>
          s.items.some((i) => i.ayahId === ayahId) || s.items.length >= CART_MAX_ITEMS
            ? s
            : { items: [...s.items, tafsirBookId ? { ayahId, tafsirBookId } : { ayahId }] },
        ),
      remove: (ayahId) => set((s) => ({ items: s.items.filter((i) => i.ayahId !== ayahId) })),
      setTafsir: (ayahId, tafsirBookId) =>
        set((s) => ({
          items: s.items.map((i) =>
            i.ayahId !== ayahId ? i : tafsirBookId === undefined ? { ayahId } : { ayahId, tafsirBookId },
          ),
        })),
      clear: () => set({ items: [] }),
    }),
    {
      name: STORAGE_KEYS.cart,
      storage: cartStorage,
      partialize: (s) => ({ items: s.items }),
    },
  ),
);
