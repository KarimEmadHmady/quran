'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminErrorMessage } from '@/lib/admin';
import { AdminApiError } from '@/lib/adminApi';

export type Loadable<T> = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; data: T };

/**
 * Loads `fetcher` whenever `deps` change (aborting the previous request) and exposes a
 * `reload()`. A 401 is handled globally by the dashboard shell (redirect to login).
 */
export function useAdminData<T>(fetcher: (signal: AbortSignal) => Promise<T>, deps: unknown[]) {
  const [value, setValue] = useState<Loadable<T>>({ state: 'loading' });
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    const ctrl = new AbortController();
    setValue((v) => (v.state === 'ready' ? v : { state: 'loading' }));
    fetcher(ctrl.signal)
      .then((data) => setValue({ state: 'ready', data }))
      .catch((err: unknown) => {
        if ((err as Error).name === 'AbortError') return;
        setValue({ state: 'error', message: adminErrorMessage(err instanceof AdminApiError ? err.status : 0, 'load') });
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { value, reload, setValue };
}

export const statusOf = (err: unknown) => (err instanceof AdminApiError ? err.status : 0);
