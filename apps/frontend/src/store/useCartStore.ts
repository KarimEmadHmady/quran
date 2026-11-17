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
  /** Attach (or with undefined = «بدون تفسير», drop) a tafsir book for one item. */
  setTafsir: (ayahId: number, tafsirBookId: number | undefined) => void;
  /**
   * Gives every item that has no tafsir yet — and that the user did NOT explicitly set to
   * «بدون تفسير» — this default book (the first book of the dropdown).
   */
  applyDefaultTafsir: (tafsirBookId: number) => void;
  clear: () => void;
}

/**
 * Ayah ids the user explicitly set to «بدون تفسير». Kept outside `quran_cart` so its spec shape
 * ({ ayahId; tafsirBookId? }[]) is unchanged: there, "no tafsir" and "not chosen yet" look alike.
 */
function readNoTafsir(): Set<number> {
  const raw = getItem<unknown>(STORAGE_KEYS.cartNoTafsir, []);
  return new Set(Array.isArray(raw) ? raw.filter((n): n is number => Number.isInteger(n) && n > 0) : []);
}
/** True when the user explicitly chose «بدون تفسير» for this cart ayah. */
export function hasExplicitNoTafsir(ayahId: number): boolean {
  return readNoTafsir().has(ayahId);
}
function writeNoTafsir(ids: Set<number>): void {
  if (ids.size === 0) removeItem(STORAGE_KEYS.cartNoTafsir);
  else setItem(STORAGE_KEYS.cartNoTafsir, [...ids].slice(0, CART_MAX_ITEMS));
}
function setNoTafsir(ayahId: number, none: boolean): void {
  const ids = readNoTafsir();
  const had = ids.has(ayahId);
  if (none === had) return;
  if (none) ids.add(ayahId);
  else ids.delete(ayahId);
  writeNoTafsir(ids);
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
      remove: (ayahId) => {
        setNoTafsir(ayahId, false);
        set((s) => ({ items: s.items.filter((i) => i.ayahId !== ayahId) }));
      },
      setTafsir: (ayahId, tafsirBookId) => {
        setNoTafsir(ayahId, tafsirBookId === undefined);
        set((s) => ({
          items: s.items.map((i) =>
            i.ayahId !== ayahId ? i : tafsirBookId === undefined ? { ayahId } : { ayahId, tafsirBookId },
          ),
        }));
      },
      applyDefaultTafsir: (tafsirBookId) =>
        set((s) => {
          if (!Number.isInteger(tafsirBookId)) return s;
          const none = readNoTafsir();
          let changed = false;
          const items = s.items.map((i) => {
            if (i.tafsirBookId !== undefined || none.has(i.ayahId)) return i;
            changed = true;
            return { ayahId: i.ayahId, tafsirBookId };
          });
          return changed ? { items } : s;
        }),
      clear: () => {
        removeItem(STORAGE_KEYS.cartNoTafsir);
        set({ items: [] });
      },
    }),
    {
      name: STORAGE_KEYS.cart,
      storage: cartStorage,
      partialize: (s) => ({ items: s.items }),
    },
  ),
);
