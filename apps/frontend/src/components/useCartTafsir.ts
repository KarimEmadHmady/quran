'use client';

import { useEffect, useState } from 'react';
import { tafsirBooks, type CartItem, type TafsirBook } from '@/lib/api';
import { hasExplicitNoTafsir, useCartStore } from '@/store/useCartStore';
import { useUiStore } from '@/store/useUiStore';
import type { ImageContent } from './ShareAsImageModal';

/*
 * Shared cart tafsir logic for BOTH the cart drawer (FloatingCart) and the /cart page, so an
 * export never depends on which one was opened first:
 *  - default book = the first book of the dropdown (the option right after «بدون تفسير»), given
 *    to every item that has no tafsir yet and was NOT explicitly set to «بدون تفسير»;
 *  - a manually chosen book and an explicit «بدون تفسير» are always kept;
 *  - the «تضمين التفسير» checkbox (unchecked = ayah only) applies to the PDF and the image alike.
 */

/** GET /tafsir-books once per visit (shared by the drawer and /cart); a failure is retried next time. */
let booksPromise: Promise<TafsirBook[]> | null = null;
export function loadTafsirBooks(): Promise<TafsirBook[]> {
  if (!booksPromise) {
    booksPromise = tafsirBooks().catch((err: unknown) => {
      booksPromise = null;
      throw err;
    });
  }
  return booksPromise;
}

/** Applies the default book to undecided items (no-op without books). */
export async function ensureDefaultTafsir(): Promise<void> {
  const books = await loadTafsirBooks().catch(() => [] as TafsirBook[]);
  if (books[0]) useCartStore.getState().applyDefaultTafsir(books[0].id);
}

/** The book actually exported for one item (undefined = ayah only). */
export function exportedTafsirBookId(item: CartItem, tafsirOff: readonly number[]): number | undefined {
  if (tafsirOff.includes(item.ayahId)) return undefined; // «تضمين التفسير» unchecked
  return item.tafsirBookId; // undefined = explicit «بدون تفسير» (or no book exists)
}

/**
 * Items for POST /export/pdf: default book applied first (awaits the book list if needed), then
 * each item's tafsir per its own choice and its «تضمين التفسير» checkbox.
 */
export async function prepareCartExport(): Promise<CartItem[]> {
  await ensureDefaultTafsir();
  const items = useCartStore.getState().items;
  const off = useUiStore.getState().cartTafsirOff;
  return items.map((i) => {
    const tafsirBookId = exportedTafsirBookId(i, off);
    return tafsirBookId === undefined ? { ayahId: i.ayahId } : { ayahId: i.ayahId, tafsirBookId };
  });
}

/**
 * Image download of one cart item: which book, and whether the tafsir is drawn at all. Before
 * the default is applied (book list still loading), an item that is not «بدون تفسير» still gets
 * its tafsir (the image then uses the confirmed books).
 */
export function imageTafsirFor(
  item: CartItem,
  tafsirOff: readonly number[],
): { tafsirBookId: number | undefined; content: ImageContent } {
  if (tafsirOff.includes(item.ayahId)) return { tafsirBookId: undefined, content: 'ayah' };
  if (item.tafsirBookId !== undefined) return { tafsirBookId: item.tafsirBookId, content: 'ayah_tafsir' };
  return hasExplicitNoTafsir(item.ayahId)
    ? { tafsirBookId: undefined, content: 'ayah' }
    : { tafsirBookId: undefined, content: 'ayah_tafsir' };
}

/**
 * While `active` (drawer open / /cart mounted): loads the book list and keeps the default
 * applied as items are added. Returns the books (for the /cart dropdown).
 */
export function useCartTafsirDefaults(active: boolean): TafsirBook[] {
  const [books, setBooks] = useState<TafsirBook[]>([]);
  const itemCount = useCartStore((s) => s.items.length);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    loadTafsirBooks()
      .then((list) => !cancelled && setBooks(list))
      .catch(() => !cancelled && setBooks([]));
    return () => {
      cancelled = true;
    };
  }, [active]);

  const defaultBookId = books[0]?.id;
  useEffect(() => {
    if (active && defaultBookId !== undefined) useCartStore.getState().applyDefaultTafsir(defaultBookId);
  }, [active, defaultBookId, itemCount]);

  return books;
}
