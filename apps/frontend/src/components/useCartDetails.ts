'use client';

import { useEffect, useState } from 'react';
import { ayahsByIds, type CartAyah } from '@/lib/api';
import { useCartStore } from '@/store/useCartStore';

/** Cart items joined with their display data from GET /ayahs (loaded when the ids change). */
export function useCartDetails(enabled = true) {
  const items = useCartStore((s) => s.items);
  const [details, setDetails] = useState<Map<number, CartAyah>>(new Map());
  const [error, setError] = useState(false);
  const key = items.map((i) => i.ayahId).join(',');

  useEffect(() => {
    if (!enabled || !key) return;
    const ctrl = new AbortController();
    setError(false);
    ayahsByIds(key.split(',').map(Number), ctrl.signal)
      .then((list) => setDetails(new Map(list.map((a) => [a.id, a]))))
      .catch(() => {
        if (!ctrl.signal.aborted) setError(true);
      });
    return () => ctrl.abort();
  }, [key, enabled]);

  return { items, details, error };
}
