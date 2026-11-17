'use client';

import { create } from 'zustand';
import {
  audioApi,
  audioErrorMessage,
  type AudioTrack,
  type Reciter,
  type SuraAudio,
  type SurahFile,
  type SurahReciter,
} from '@/lib/audioApi';
import { STORAGE_KEYS, getItem, removeItem, setItem } from '@/lib/localStore';
import {
  DEFAULT_AUDIO_PREFS,
  MAX_REPEAT,
  parseAudioPrefs,
  parseAudioSession,
  type AudioPrefs,
  type AudioSessionSaved,
  type PlaybackMode,
} from '@/lib/shapes';

/**
 * The ONE audio controller of the app. A single <audio> element plays everything (plus one
 * silent element that only preloads the next ayah), so two recitations can never overlap.
 *
 * Two playback sessions share that element:
 *  - "ayah"  (Mode A): one MP3 per ayah, from the verse-by-verse reciter list; auto-next,
 *            repeat, continue to the next sura.
 *  - "surah" (Mode B): ONE MP3 for the whole sura, from the separate full-sura reciter list;
 *            never loads ayah files.
 * Every play request takes a new token (`seq`) and pauses the element first; any async step
 * whose token is stale is dropped. That makes rapid clicks, reciter switches, sura changes and
 * switching between the two modes safe. The element lives at module level, so navigating
 * between pages does not interrupt playback or leak instances.
 */

export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'buffering' | 'ended' | 'error';
export type PlaybackSession = 'ayah' | 'surah';

export interface NowPlaying extends AudioTrack {
  suraName: string;
  reciterName: string;
}

/** The full-sura file being played (Mode B). */
export interface SurahNowPlaying {
  suraNumber: number;
  suraName: string;
  reciterId: string;
  reciterName: string;
  url: string;
}

type ListState<T> =
  | { state: 'idle' | 'loading' }
  | { state: 'error'; message: string }
  | { state: 'ready'; data: T[]; defaultReciter: string | null };

interface AudioState extends AudioPrefs {
  hydrated: boolean;
  /** Verse-by-verse reciters (Mode A). */
  reciters: ListState<Reciter>;
  /** Full-sura reciters (Mode B) — a different list. */
  surahReciters: ListState<SurahReciter>;
  /** Which mode the current / last playback uses (null = nothing played yet). */
  session: PlaybackSession | null;
  /**
   * The listening position saved on a previous visit (`quran_audio_session`), restored PAUSED:
   * nothing is loaded or played until the user presses play. Cleared once that recording
   * actually starts again (or the user closes the player).
   */
  restored: AudioSessionSaved | null;
  /** Whether the player panel is shown (the bottom-nav «المشغّل» button toggles it). */
  playerOpen: boolean;
  setPlayerOpen: (open: boolean) => void;
  status: PlayerStatus;
  /** Mode A: the ayah being recited. */
  current: NowPlaying | null;
  /** Mode A: ayah requested but not playing yet (loading), for button spinners. */
  pending: { suraNumber: number; ayahNumber: number } | null;
  /** Mode B: the sura file being played. */
  surahNow: SurahNowPlaying | null;
  /** Mode B: sura requested but not playing yet. */
  surahPending: number | null;
  position: number;
  duration: number;
  /** Completed plays of the current ayah (for the repeat count, Mode A). */
  played: number;
  error: string | null;
  notice: string | null;
  /** Network errors can be retried; a missing recording cannot. */
  retryable: boolean;

  hydrate: () => void;
  loadReciters: (force?: boolean) => Promise<void>;
  loadSurahReciters: (force?: boolean) => Promise<void>;
  setReciter: (identifier: string) => void;
  setSurahReciter: (identifier: string) => void;
  setVolume: (v: number) => void;
  setRepeat: (n: number) => void;
  setMode: (m: PlaybackMode) => void;
  /** Effective ayah reciter: the saved one if still offered, otherwise the server default. */
  reciterId: () => string | null;
  /**
   * Effective full-sura reciter (always one that HAS full-sura recordings): the saved one, else
   * the same reciter as the ayah reciter when it exists in the full-sura list, else the default.
   */
  surahReciterId: () => string | null;

  playAyah: (suraNumber: number, ayahNumber: number) => void;
  /**
   * «تشغيل آية تلو الأخرى»: plays every ayah of a sura from the first one, exactly as the
   * per-ayah «استماع» button does (same files, reciter, repeat, highlight), then stops at the end
   * of the sura whatever the saved "after the ayah" mode is.
   */
  playSuraAyahs: (suraNumber: number) => void;
  /** Sura of a running «آية تلو الأخرى» session (forces stop-at-end-of-sura); null otherwise. */
  sequenceSura: number | null;
  /** Mode B: plays the whole sura from ONE MP3 file. */
  playFullSurah: (suraNumber: number) => void;
  toggle: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  /** Mode A: next ayah. Mode B: next sura. */
  next: () => void;
  /** Mode A: previous ayah. Mode B: previous sura (or restart when > 3 s in). */
  prev: () => void;
  seek: (seconds: number) => void;
  /** Relative seek (e.g. -10 / +10 seconds). */
  seekBy: (delta: number) => void;
  retry: () => void;
}

// ------------------------------------------------------------------ engine (module scope)

let el: HTMLAudioElement | null = null;
let preloader: HTMLAudioElement | null = null;
let seq = 0;
let playlist: SuraAudio | null = null;
let index = -1;
let fallbacks: string[] = [];
/** True while we are swapping `src` ourselves (ignore the resulting pause / error events). */
let switching = false;

const PLAYLIST_CACHE_MAX = 12;
const playlists = new Map<string, Promise<SuraAudio>>();
/** Resolved full-sura URLs (tiny responses; the MP3 itself is streamed, never cached here). */
const SURAH_FILE_CACHE_MAX = 60;
const surahFiles = new Map<string, Promise<SurahFile>>();

function cached<T>(map: Map<string, Promise<T>>, max: number, key: string, load: () => Promise<T>): Promise<T> {
  let p = map.get(key);
  if (!p) {
    p = load();
    p.catch(() => map.delete(key)); // never cache a failure
    map.set(key, p);
    while (map.size > max) map.delete(map.keys().next().value as string);
  }
  return p;
}

const loadPlaylist = (reciter: string, sura: number) =>
  cached(playlists, PLAYLIST_CACHE_MAX, `${reciter}:${sura}`, () => audioApi.sura(sura, reciter));
const loadSurahFile = (reciter: string, sura: number) =>
  cached(surahFiles, SURAH_FILE_CACHE_MAX, `${reciter}:${sura}`, () => audioApi.fullSurah(sura, reciter));

// ------------------------------------------------------------------ saved listening position

/** How often the position is saved while playing (also saved on play / pause / ayah or sura change / leaving). */
const PERSIST_EVERY_MS = 5000;
let lastPersist = 0;
let pageHooks = false;

/**
 * Saves what is playing now to `quran_audio_session` (metadata only). Nothing is written while
 * a restored session has not been resumed yet (the saved one is still the truth), or while a
 * new recording is still loading.
 */
function persistSession(): void {
  if (typeof window === 'undefined') return;
  const s = useAudioStore.getState();
  if (s.restored) return;
  const loaded = !!el?.getAttribute('src');
  const position = loaded && el ? el.currentTime : s.position;
  const duration = loaded && el && Number.isFinite(el.duration) ? el.duration : s.duration;
  const wasPlaying = s.status === 'playing' || s.status === 'buffering' || s.status === 'loading';
  const base = { position, duration, wasPlaying, updatedAt: new Date().toISOString() };
  let saved: AudioSessionSaved | null = null;
  if (s.session === 'surah' && s.surahNow && s.surahPending === null) {
    saved = {
      ...base,
      kind: 'surah',
      sequence: false,
      suraNumber: s.surahNow.suraNumber,
      ayahNumber: null,
      reciter: s.surahNow.reciterId,
      suraName: s.surahNow.suraName,
      reciterName: s.surahNow.reciterName,
    };
  } else if (s.session === 'ayah' && s.current && s.pending === null && playlist) {
    saved = {
      ...base,
      kind: 'ayah',
      sequence: s.sequenceSura !== null,
      suraNumber: s.current.suraNumber,
      ayahNumber: s.current.ayahNumber,
      reciter: playlist.reciter.identifier,
      suraName: s.current.suraName,
      reciterName: s.current.reciterName,
    };
  }
  const valid = saved && parseAudioSession(saved);
  if (!valid) return;
  setItem(STORAGE_KEYS.audioSession, valid);
  lastPersist = Date.now();
}

/** Save when the tab is hidden or the page is left (reload, close, app switch). */
function hookPageLifecycle(): void {
  if (pageHooks || typeof window === 'undefined') return;
  pageHooks = true;
  window.addEventListener('pagehide', persistSession);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persistSession();
  });
}

/** Resumes a restored session: the SAME recording (reciter) at the saved position. */
function playRestored(r: AudioSessionSaved): void {
  if (r.kind === 'surah') {
    void playSurahFile(r.suraNumber, { reciter: r.reciter, startAt: r.position });
    return;
  }
  useAudioStore.setState({ sequenceSura: r.sequence ? r.suraNumber : null });
  void playFrom(r.suraNumber, (r.ayahNumber ?? 1) - 1, { skipMissing: false, reciter: r.reciter, startAt: r.position });
}

/** The saved recording cannot be played any more (reciter removed / file missing): forget it, play nothing else. */
function dropRestored(message: string): void {
  removeItem(STORAGE_KEYS.audioSession);
  useAudioStore.setState({ restored: null, status: 'error', error: message, retryable: false, pending: null, surahPending: null });
}

function element(): HTMLAudioElement {
  if (el) return el;
  el = new Audio();
  el.preload = 'auto';
  const set = useAudioStore.setState;
  el.addEventListener('playing', () => {
    set({ status: 'playing', error: null, retryable: false });
    persistSession();
  });
  el.addEventListener('waiting', () => {
    if (useAudioStore.getState().status === 'playing') set({ status: 'buffering' });
  });
  el.addEventListener('pause', () => {
    if (switching) return;
    if (!el!.ended) {
      const s = useAudioStore.getState().status;
      if (s === 'playing' || s === 'buffering') set({ status: 'paused' });
    }
    persistSession();
  });
  el.addEventListener('timeupdate', () => {
    set({ position: el!.currentTime });
    if (Date.now() - lastPersist > PERSIST_EVERY_MS) persistSession();
  });
  el.addEventListener('durationchange', () => set({ duration: Number.isFinite(el!.duration) ? el!.duration : 0 }));
  el.addEventListener('ended', onEnded);
  el.addEventListener('error', onMediaError);
  setupMediaSession();
  return el;
}

/** Stops whatever is playing right now (before a new request loads), without state flicker. */
function halt(): void {
  if (!el) return;
  switching = true;
  el.pause();
  switching = false;
}

/** Drops the current source entirely (releases the network stream / decoder). */
function release(): void {
  if (!el) return;
  switching = true;
  el.pause();
  el.removeAttribute('src');
  el.load();
  switching = false;
}

function preload(url: string | null): void {
  if (typeof Audio === 'undefined') return;
  if (!preloader) {
    preloader = new Audio();
    preloader.preload = 'auto';
    preloader.muted = true;
  }
  if (!url) {
    if (preloader.getAttribute('src')) {
      preloader.removeAttribute('src');
      preloader.load();
    }
    return;
  }
  if (preloader.src !== url) {
    preloader.src = url;
    preloader.load();
  }
}

async function ensureReciters(): Promise<void> {
  const s = useAudioStore.getState();
  if (s.reciters.state !== 'ready') await s.loadReciters();
}

async function ensureSurahReciters(): Promise<void> {
  const s = useAudioStore.getState();
  // The ayah list is used to match "the same reciter" for the full-sura choice.
  await Promise.all([
    s.surahReciters.state !== 'ready' ? s.loadSurahReciters() : undefined,
    s.reciters.state !== 'ready' ? s.loadReciters() : undefined,
  ]);
}

/**
 * Loads `url` into the one element and plays it. With `startAt` (resuming a saved position) it
 * waits for the file's metadata, seeks, and only then plays, so it never starts from 0:00.
 */
function startElement(url: string, token: number, startAt = 0): void {
  const a = element();
  switching = true;
  a.src = url;
  a.volume = useAudioStore.getState().volume;
  switching = false;
  const play = () =>
    void a.play().catch((err: unknown) => {
      if (token !== seq) return;
      const name = (err as Error)?.name;
      if (name === 'AbortError') return; // replaced by a newer request
      if (name === 'NotAllowedError') useAudioStore.setState({ status: 'paused' }); // autoplay blocked
    });
  if (startAt <= 0) {
    play();
    return;
  }
  a.addEventListener(
    'loadedmetadata',
    () => {
      if (token !== seq) return;
      const max = Number.isFinite(a.duration) ? Math.max(0, a.duration - 0.5) : startAt;
      a.currentTime = Math.min(startAt, max);
      useAudioStore.setState({ position: a.currentTime });
      play();
    },
    { once: true },
  );
}

// ------------------------------------------------------------------ Mode A: ayah by ayah

/** Starts track `i` of `pl` (must already be the current token). */
function startTrack(pl: SuraAudio, i: number, token: number, startAt = 0): void {
  if (token !== seq) return;
  const t = pl.tracks[i];
  if (!t?.url) return;
  playlist = pl;
  index = i;
  fallbacks = [...t.fallbackUrls];
  useAudioStore.setState({
    restored: null,
    session: 'ayah',
    current: { ...t, suraName: pl.sura.nameAr, reciterName: pl.reciter.name },
    pending: null,
    surahNow: null,
    surahPending: null,
    status: 'loading',
    position: 0,
    duration: 0,
    played: 0,
    error: null,
    retryable: false,
  });
  startElement(t.url, token, startAt);
  updateMediaSession();
  preload(nextUrl(pl, i));
  // The ayah changed. (When resuming at `startAt`, wait: the 'playing' event saves after the seek.)
  if (!startAt) persistSession();
}

function nextUrl(pl: SuraAudio, i: number): string | null {
  for (let j = i + 1; j < pl.tracks.length; j++) if (pl.tracks[j].url) return pl.tracks[j].url;
  return null;
}

/** Loads a sura's ayah playlist and plays from ayah `from` (or the last ayah when `from` = -1). */
async function playFrom(
  sura: number,
  from: number,
  opts: {
    skipMissing: boolean;
    /** Exact reciter to use (a restored session); it must still be offered, or nothing plays. */
    reciter?: string;
    /** Seconds into the first ayah (a restored session). */
    startAt?: number;
  },
): Promise<void> {
  const token = ++seq;
  halt();
  useAudioStore.setState({
    session: 'ayah',
    surahNow: null,
    surahPending: null,
    pending: { suraNumber: sura, ayahNumber: from === -1 ? 0 : from + 1 },
    status: 'loading',
    error: null,
    notice: null,
    retryable: false,
  });
  try {
    await ensureReciters();
    const st = useAudioStore.getState();
    if (opts.reciter && st.reciters.state === 'ready' && !st.reciters.data.some((r) => r.identifier === opts.reciter)) {
      if (token === seq) dropRestored('التسجيل المحفوظ لم يعد متاحاً (القارئ غير متوفر). اختر آية للاستماع.');
      return;
    }
    const reciter = opts.reciter ?? st.reciterId();
    if (!reciter) throw new Error('no-reciter');
    const pl = await loadPlaylist(reciter, sura);
    if (token !== seq) return;
    let i = from === -1 ? pl.tracks.length - 1 : from;
    if (!pl.tracks[i]?.url) {
      if (useAudioStore.getState().restored && !opts.skipMissing) {
        dropRestored('التسجيل المحفوظ لم يعد متاحاً. اختر آية للاستماع.');
        return;
      }
      if (!opts.skipMissing) {
        playlist = pl;
        index = i;
        useAudioStore.setState({
          status: 'error',
          pending: null,
          error: 'لا يوجد تسجيل لهذه الآية عند هذا القارئ.',
          retryable: false,
        });
        return;
      }
      const step = from === -1 ? -1 : 1;
      while (i >= 0 && i < pl.tracks.length && !pl.tracks[i].url) i += step;
      if (i < 0 || i >= pl.tracks.length) {
        useAudioStore.setState({ status: 'ended', pending: null, notice: 'لا توجد تسجيلات متاحة لهذه السورة.' });
        return;
      }
      useAudioStore.setState({ notice: 'تم تخطي آية لا يتوفر لها تسجيل.' });
    }
    // The saved position belongs to the requested ayah only (never to a skipped-to one).
    startTrack(pl, i, token, i === from ? (opts.startAt ?? 0) : 0);
  } catch (err) {
    if (token !== seq) return;
    useAudioStore.setState({
      status: 'error',
      error: (err as Error)?.message === 'no-reciter' ? 'لا يوجد قارئ متاح حالياً.' : audioErrorMessage(err),
      retryable: true,
    });
  }
}

/** Ayah-mode continuation: a «آية تلو الأخرى» run always stops at the end of its sura. */
const ayahMode = (s: { mode: PlaybackMode; sequenceSura: number | null }): PlaybackMode =>
  s.sequenceSura !== null ? 'sura' : s.mode;

/** Next playable ayah. `manual` = the user pressed "next" (ignores the "single" mode). */
function advance(manual: boolean): void {
  const s = useAudioStore.getState();
  if (!playlist) return;
  if (!manual && ayahMode(s) === 'single') {
    useAudioStore.setState({ status: 'ended' });
    return;
  }
  let skipped = false;
  for (let j = index + 1; j < playlist.tracks.length; j++) {
    if (playlist.tracks[j].url) {
      if (skipped) useAudioStore.setState({ notice: 'تم تخطي آية لا يتوفر لها تسجيل.' });
      startTrack(playlist, j, ++seq);
      return;
    }
    skipped = true;
  }
  const sura = playlist.sura.number;
  if ((manual || ayahMode(s) === 'quran') && sura < 114) {
    void playFrom(sura + 1, 0, { skipMissing: true });
    return;
  }
  useAudioStore.setState({ status: 'ended' });
}

// ------------------------------------------------------------------ Mode B: one file per sura

async function playSurahFile(
  sura: number,
  opts: {
    /** Exact full-sura reciter (a restored session); it must still be offered, or nothing plays. */
    reciter?: string;
    /** Seconds into the file (a restored session). */
    startAt?: number;
  } = {},
): Promise<void> {
  if (!Number.isInteger(sura) || sura < 1 || sura > 114) {
    useAudioStore.setState({ status: 'error', error: 'رقم السورة غير صحيح.', retryable: false });
    return;
  }
  const token = ++seq;
  halt();
  // Leaving Mode A: forget its playlist and stop preloading ayah files.
  playlist = null;
  index = -1;
  fallbacks = [];
  preload(null);
  useAudioStore.setState({
    session: 'surah',
    current: null,
    pending: null,
    surahPending: sura,
    status: 'loading',
    position: 0,
    duration: 0,
    played: 0,
    error: null,
    notice: null,
    retryable: false,
  });
  try {
    await ensureSurahReciters();
    const st = useAudioStore.getState();
    if (
      opts.reciter &&
      st.surahReciters.state === 'ready' &&
      !st.surahReciters.data.some((r) => r.identifier === opts.reciter)
    ) {
      if (token === seq) dropRestored('التسجيل المحفوظ لم يعد متاحاً (القارئ غير متوفر). اختر سورة للاستماع.');
      return;
    }
    const reciter = opts.reciter ?? st.surahReciterId();
    if (!reciter) throw new Error('no-reciter');
    let file: SurahFile;
    try {
      file = await loadSurahFile(reciter, sura);
    } catch (err) {
      // A restored recording that no longer exists: say so, never play another one.
      if (token === seq && opts.reciter && (err as { status?: number })?.status === 404) {
        dropRestored('التسجيل المحفوظ لم يعد متاحاً. اختر سورة للاستماع.');
        return;
      }
      throw err;
    }
    if (token !== seq) return;
    useAudioStore.setState({
      restored: null,
      surahNow: {
        suraNumber: file.sura.number,
        suraName: file.sura.nameAr,
        reciterId: file.reciter.identifier,
        reciterName: surahReciterLabel(file.reciter),
        url: file.url,
      },
      surahPending: null,
    });
    startElement(file.url, token, opts.startAt ?? 0);
    updateMediaSession();
    if (!opts.startAt) persistSession(); // the sura changed
  } catch (err) {
    if (token !== seq) return;
    const msg = (err as Error)?.message;
    useAudioStore.setState({
      status: 'error',
      error:
        msg === 'no-reciter'
          ? 'لا يوجد قارئ متاح للسورة كاملة حالياً.'
          : (err as { status?: number })?.status === 404
            ? 'لا يتوفر تسجيل كامل لهذه السورة عند هذا القارئ. اختر قارئاً آخر.'
            : audioErrorMessage(err),
      retryable: (err as { status?: number })?.status !== 404 && msg !== 'no-reciter',
    });
  }
}

/** Arabic name of a full-sura reciter, falling back to the English name / identifier. */
export function surahReciterLabel(r: { identifier: string; name: string | null; englishName: string | null }): string {
  return r.name ?? r.englishName ?? r.identifier;
}

// ------------------------------------------------------------------ element events

function onEnded(): void {
  const s = useAudioStore.getState();
  if (s.session === 'surah') {
    const n = s.surahNow?.suraNumber;
    if (n && s.mode === 'quran' && n < 114) void playSurahFile(n + 1);
    else useAudioStore.setState({ status: 'ended' });
    return;
  }
  const played = s.played + 1;
  if (s.repeat === 0 || played < s.repeat) {
    useAudioStore.setState({ played });
    const a = element();
    a.currentTime = 0;
    void a.play().catch(() => undefined);
    return;
  }
  advance(false);
}

function onMediaError(): void {
  if (switching || !el?.getAttribute('src')) return;
  const s = useAudioStore.getState();
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const code = el.error?.code;

  if (s.session === 'surah') {
    useAudioStore.setState({
      status: 'error',
      error:
        offline || code === MediaError.MEDIA_ERR_NETWORK
          ? 'انقطع الاتصال أثناء تشغيل السورة.'
          : 'تعذّر تحميل ملف السورة من خادم التلاوات.',
      retryable: true,
    });
    return;
  }

  const next = fallbacks.shift();
  if (next) {
    // Same recording at another verified bitrate.
    switching = true;
    el.src = next;
    switching = false;
    void el.play().catch(() => undefined);
    return;
  }
  if (offline || code === MediaError.MEDIA_ERR_NETWORK) {
    useAudioStore.setState({ status: 'error', error: 'انقطع الاتصال أثناء التشغيل.', retryable: true });
    return;
  }
  if (ayahMode(s) !== 'single' && playlist) {
    useAudioStore.setState({ notice: 'تعذّر تشغيل آية فتم تخطيها.' });
    advance(false);
    return;
  }
  useAudioStore.setState({
    status: 'error',
    error: code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED ? 'التسجيل غير متاح أو بصيغة غير مدعومة.' : 'تعذّر تشغيل التلاوة.',
    retryable: true,
  });
}

// ------------------------------------------------------------------ Media Session (lock screen)

function setupMediaSession(): void {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  const ms = navigator.mediaSession;
  const st = () => useAudioStore.getState();
  try {
    ms.setActionHandler('play', () => st().resume());
    ms.setActionHandler('pause', () => st().pause());
    ms.setActionHandler('stop', () => st().stop());
    ms.setActionHandler('nexttrack', () => st().next());
    ms.setActionHandler('previoustrack', () => st().prev());
    ms.setActionHandler('seekbackward', (d) => st().seekBy(-(d.seekOffset ?? 10)));
    ms.setActionHandler('seekforward', (d) => st().seekBy(d.seekOffset ?? 10));
  } catch {
    // unsupported action: ignore
  }
}

function updateMediaSession(): void {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
  const s = useAudioStore.getState();
  if (s.session === 'surah' && s.surahNow) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: `سورة ${s.surahNow.suraName} (كاملة)`,
      artist: s.surahNow.reciterName,
      album: 'القرآن الكريم',
    });
    return;
  }
  const c = s.current;
  if (!c) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: `سورة ${c.suraName} · آية ${c.ayahNumber}`,
    artist: c.reciterName,
    album: 'القرآن الكريم',
  });
}

// ------------------------------------------------------------------ store

export const useAudioStore = create<AudioState>()((set, get) => {
  const save = () => {
    const { reciter, surahReciter, volume, repeat, mode } = get();
    setItem<AudioPrefs>(STORAGE_KEYS.audio, { reciter, surahReciter, volume, repeat, mode });
  };
  const isActive = () => {
    const st = get().status;
    return st !== 'idle' && st !== 'ended';
  };
  /** Keeps a restored (not yet resumed) session in sync with the user's changes, unplayed. */
  const updateRestored = (patch: Partial<AudioSessionSaved>) => {
    const r = get().restored;
    if (!r) return;
    const next = parseAudioSession({ ...r, ...patch, updatedAt: new Date().toISOString() });
    if (!next) return;
    set({ restored: next, position: next.position, duration: next.duration });
    setItem(STORAGE_KEYS.audioSession, next);
  };
  return {
    ...DEFAULT_AUDIO_PREFS,
    hydrated: false,
    reciters: { state: 'idle' },
    surahReciters: { state: 'idle' },
    session: null,
    restored: null,
    playerOpen: false,
    sequenceSura: null,
    status: 'idle',
    current: null,
    pending: null,
    surahNow: null,
    surahPending: null,
    position: 0,
    duration: 0,
    played: 0,
    error: null,
    notice: null,
    retryable: false,

    /**
     * Preferences + the last listening position. A saved session is restored PAUSED: no audio
     * element is created, nothing is fetched or played until the user presses play.
     */
    hydrate: () => {
      const saved = parseAudioPrefs(getItem<unknown>(STORAGE_KEYS.audio, null));
      const raw = getItem<unknown>(STORAGE_KEYS.audioSession, null);
      const session = parseAudioSession(raw);
      if (raw !== null && !session) removeItem(STORAGE_KEYS.audioSession); // invalid / old data
      set({
        ...(saved ?? {}),
        hydrated: true,
        ...(session && {
          restored: session,
          session: session.kind,
          status: 'paused' as const,
          position: session.duration > 0 ? Math.min(session.position, session.duration) : session.position,
          duration: session.duration,
          sequenceSura: session.kind === 'ayah' && session.sequence ? session.suraNumber : null,
        }),
      });
      hookPageLifecycle();
    },

    setPlayerOpen: (playerOpen) => set({ playerOpen }),

    loadReciters: async (force = false) => {
      const r = get().reciters;
      if (!force && (r.state === 'ready' || r.state === 'loading')) return;
      set({ reciters: { state: 'loading' } });
      try {
        const res = await audioApi.reciters();
        set({ reciters: { state: 'ready', data: res.data, defaultReciter: res.defaultReciter } });
      } catch (err) {
        set({ reciters: { state: 'error', message: audioErrorMessage(err) } });
      }
    },

    loadSurahReciters: async (force = false) => {
      const r = get().surahReciters;
      if (!force && (r.state === 'ready' || r.state === 'loading')) return;
      set({ surahReciters: { state: 'loading' } });
      try {
        const res = await audioApi.fullSurahReciters();
        set({ surahReciters: { state: 'ready', data: res.data, defaultReciter: res.defaultReciter } });
      } catch (err) {
        set({ surahReciters: { state: 'error', message: audioErrorMessage(err) } });
      }
    },

    reciterId: () => {
      const { reciter, reciters } = get();
      if (reciters.state !== 'ready') return reciter;
      if (reciter && reciters.data.some((r) => r.identifier === reciter)) return reciter;
      return reciters.defaultReciter;
    },

    surahReciterId: () => {
      const { surahReciter, surahReciters, reciters } = get();
      if (surahReciters.state !== 'ready') return surahReciter;
      const list = surahReciters.data;
      if (surahReciter && list.some((r) => r.identifier === surahReciter)) return surahReciter;
      // Same reciter as for ayahs, only when it really has full-sura recordings.
      const ayahId = get().reciterId();
      if (ayahId && list.some((r) => r.identifier === ayahId)) return ayahId;
      if (ayahId && reciters.state === 'ready') {
        const name = reciters.data.find((r) => r.identifier === ayahId)?.name;
        const byName = name ? list.find((r) => r.name === name) : undefined;
        if (byName) return byName.identifier;
      }
      return surahReciters.defaultReciter;
    },

    setReciter: (identifier) => {
      if (identifier === get().reciter) return;
      set({ reciter: identifier });
      save();
      // A restored ayah session not resumed yet: it will use the newly chosen reciter, from the start of the ayah.
      if (get().restored?.kind === 'ayah') {
        const list = get().reciters;
        const name = list.state === 'ready' ? list.data.find((r) => r.identifier === identifier)?.name : undefined;
        updateRestored({ reciter: identifier, position: 0, duration: 0, ...(name && { reciterName: name }) });
        return;
      }
      // Switching the ayah reciter while listening ayah by ayah restarts the same ayah.
      const { current, pending, session } = get();
      const target = pending && pending.ayahNumber > 0 ? pending : current;
      if (session === 'ayah' && target && isActive()) {
        void playFrom(target.suraNumber, target.ayahNumber - 1, { skipMissing: false });
      }
    },

    setSurahReciter: (identifier) => {
      if (identifier === get().surahReciter) return;
      set({ surahReciter: identifier });
      save();
      // A restored full-sura session not resumed yet: another recording, so from the beginning.
      if (get().restored?.kind === 'surah') {
        const list = get().surahReciters;
        const r = list.state === 'ready' ? list.data.find((x) => x.identifier === identifier) : undefined;
        updateRestored({ reciter: identifier, position: 0, duration: 0, ...(r && { reciterName: surahReciterLabel(r) }) });
        return;
      }
      // Switching the full-sura reciter while a sura plays restarts that sura with the new voice.
      const { session, surahNow, surahPending } = get();
      const sura = surahPending ?? surahNow?.suraNumber;
      if (session === 'surah' && sura && isActive()) void playSurahFile(sura);
    },

    setVolume: (v) => {
      const volume = Math.min(1, Math.max(0, Number.isFinite(v) ? v : 1));
      set({ volume });
      if (el) el.volume = volume;
      save();
    },

    setRepeat: (n) => {
      set({ repeat: Math.min(MAX_REPEAT, Math.max(0, Math.round(n))), played: 0 });
      save();
    },

    setMode: (mode) => {
      set({ mode });
      save();
    },

    // Explicit "play this" actions: they replace any restored session and show the player.
    playAyah: (suraNumber, ayahNumber) => {
      set({ sequenceSura: null, restored: null, playerOpen: true });
      void playFrom(suraNumber, ayahNumber - 1, { skipMissing: false });
    },

    playSuraAyahs: (suraNumber) => {
      set({ sequenceSura: suraNumber, restored: null, playerOpen: true });
      void playFrom(suraNumber, 0, { skipMissing: true });
    },

    playFullSurah: (suraNumber) => {
      set({ sequenceSura: null, restored: null, playerOpen: true });
      void playSurahFile(suraNumber);
    },

    toggle: () => {
      const s = get().status;
      if (s === 'playing' || s === 'buffering' || s === 'loading') get().pause();
      else get().resume();
    },

    pause: () => {
      if (get().status === 'loading' && !el?.getAttribute('src')) {
        seq++; // cancel a pending load
        // A restored session stays restored (still paused at its saved position).
        set(get().restored ? { status: 'paused', pending: null, surahPending: null } : { status: 'idle', pending: null, surahPending: null });
        return;
      }
      el?.pause();
      set({ status: 'paused' });
      persistSession();
    },

    resume: () => {
      const { status, current, session, surahNow, restored } = get();
      // The user pressed play on a restored session: the same recording, at the saved position.
      if (restored) {
        playRestored(restored);
        return;
      }
      if (status === 'error') return get().retry();
      if (status === 'ended') {
        if (session === 'surah' && surahNow) void playSurahFile(surahNow.suraNumber);
        else if (current) void playFrom(current.suraNumber, current.ayahNumber - 1, { skipMissing: false });
        return;
      }
      if (!el?.getAttribute('src')) return;
      void el.play().catch(() => undefined);
    },

    /** Close the player: stops playback and forgets the saved listening position. */
    stop: () => {
      seq++;
      playlist = null;
      index = -1;
      fallbacks = [];
      release();
      preload(null);
      removeItem(STORAGE_KEYS.audioSession);
      set({
        session: null,
        restored: null,
        playerOpen: false,
        sequenceSura: null,
        status: 'idle',
        current: null,
        pending: null,
        surahNow: null,
        surahPending: null,
        position: 0,
        duration: 0,
        played: 0,
        error: null,
        notice: null,
      });
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) navigator.mediaSession.metadata = null;
    },

    next: () => {
      set({ notice: null });
      const { session, surahNow, surahPending, restored } = get();
      // Restored session: the user explicitly asks for the next ayah / sura (same reciter).
      if (restored) {
        set({ restored: null });
        if (restored.kind === 'surah') {
          if (restored.suraNumber < 114) void playSurahFile(restored.suraNumber + 1, { reciter: restored.reciter });
        } else {
          void playFrom(restored.suraNumber, restored.ayahNumber ?? 1, { skipMissing: true, reciter: restored.reciter });
        }
        return;
      }
      if (session === 'surah') {
        const n = surahPending ?? surahNow?.suraNumber;
        if (n && n < 114) void playSurahFile(n + 1);
        return;
      }
      advance(true);
    },

    prev: () => {
      set({ notice: null });
      const { session, surahNow, surahPending, restored } = get();
      if (restored) {
        set({ restored: null });
        if (restored.kind === 'surah') {
          if (restored.suraNumber > 1) void playSurahFile(restored.suraNumber - 1, { reciter: restored.reciter });
          else void playSurahFile(1, { reciter: restored.reciter });
        } else {
          const from = Math.max(0, (restored.ayahNumber ?? 1) - 2);
          void playFrom(restored.suraNumber, from, { skipMissing: true, reciter: restored.reciter });
        }
        return;
      }
      if (el && el.currentTime > 3 && !surahPending) {
        el.currentTime = 0;
        return;
      }
      if (session === 'surah') {
        const n = surahPending ?? surahNow?.suraNumber;
        if (n && n > 1) void playSurahFile(n - 1);
        else if (el) el.currentTime = 0;
        return;
      }
      if (!playlist) return;
      for (let j = index - 1; j >= 0; j--) {
        if (playlist.tracks[j].url) {
          startTrack(playlist, j, ++seq);
          return;
        }
      }
      const sura = playlist.sura.number;
      if (sura > 1) void playFrom(sura - 1, -1, { skipMissing: true });
      else if (el) el.currentTime = 0;
    },

    seek: (seconds) => {
      if (!Number.isFinite(seconds)) return;
      // Restored, not loaded yet: move the saved position (used when the user presses play).
      const r = get().restored;
      if (r) {
        const max = r.duration > 0 ? r.duration : seconds;
        updateRestored({ position: Math.max(0, Math.min(seconds, max)) });
        return;
      }
      if (!el) return;
      el.currentTime = Math.max(0, Math.min(seconds, Number.isFinite(el.duration) ? el.duration : seconds));
    },

    seekBy: (delta) => {
      if (!Number.isFinite(delta)) return;
      const r = get().restored;
      if (r) return get().seek(r.position + delta);
      if (!el) return;
      get().seek(el.currentTime + delta);
    },

    retry: () => {
      const { current, pending, session, surahNow, surahPending, restored } = get();
      if (restored) {
        playlists.clear();
        surahFiles.clear();
        playRestored(restored);
        return;
      }
      if (session === 'surah') {
        const n = surahPending ?? surahNow?.suraNumber;
        if (n) {
          surahFiles.clear();
          void playSurahFile(n);
        }
        return;
      }
      const target = pending && pending.ayahNumber > 0 ? pending : current;
      if (target) {
        // Network blips: drop cached playlists so they are fetched again.
        playlists.clear();
        void playFrom(target.suraNumber, target.ayahNumber - 1, { skipMissing: false });
      } else if (playlist && index >= 0) {
        void playFrom(playlist.sura.number, index, { skipMissing: false });
      }
    },
  };
});

/** Saves the current listening position now (e.g. when the user navigates to another page). */
export function saveListeningPosition(): void {
  persistSession();
}
