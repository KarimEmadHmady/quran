'use client';

import { create } from 'zustand';

export type AdhkarAudioStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

interface AdhkarAudioState {
  /** Which recording is loaded (e.g. "item:1:3" or "category:1"), or null. */
  current: string | null;
  status: AdhkarAudioStatus;
  /** Plays `src` under `id`; the same id toggles pause / resume. Any other recording stops first. */
  toggle: (id: string, src: string) => void;
  stop: () => void;
}

/**
 * The adhkar audio player. Deliberately SEPARATE from the Quran player (useAudioStore): its own
 * <audio> element, its own state, nothing persisted, and it never reads or changes Quran
 * playback. One element = only one dhikr recording can play at a time.
 * Nothing is preloaded: the element is created, and a file fetched, only when the user presses play.
 */
let el: HTMLAudioElement | null = null;

export const useAdhkarAudioStore = create<AdhkarAudioState>()((set, get) => {
  const element = (): HTMLAudioElement => {
    if (el) return el;
    el = new Audio();
    el.preload = 'none';
    const mine = (fn: () => void) => () => {
      if (get().current !== null) fn();
    };
    el.addEventListener('waiting', mine(() => set({ status: 'loading' })));
    el.addEventListener('playing', mine(() => set({ status: 'playing' })));
    // `el.paused` is false again when a new recording was started right after pausing the old one.
    el.addEventListener(
      'pause',
      mine(() => el!.paused && !el!.ended && get().status !== 'error' && set({ status: 'paused' })),
    );
    el.addEventListener('ended', mine(() => set({ status: 'idle', current: null })));
    el.addEventListener('error', mine(() => set({ status: 'error' })));
    return el;
  };

  return {
    current: null,
    status: 'idle',

    toggle: (id, src) => {
      const a = element();
      const { current, status } = get();
      if (current === id && status !== 'error') {
        if (status === 'playing' || status === 'loading') a.pause();
        else void a.play().catch(() => set({ status: 'error' }));
        return;
      }
      a.pause();
      set({ current: id, status: 'loading' });
      a.src = src;
      void a.play().catch((err: unknown) => {
        // A newer request replaced this one: not an error of the new recording.
        if (get().current !== id) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        set({ status: 'error' });
      });
    },

    stop: () => {
      if (!el) return;
      set({ current: null, status: 'idle' });
      el.pause();
      el.removeAttribute('src');
      el.load(); // releases the network connection
    },
  };
});
