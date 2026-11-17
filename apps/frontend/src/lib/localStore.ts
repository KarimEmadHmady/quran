/**
 * The ONLY place that touches localStorage (spec §2/§3): every key and read/write lives here.
 * Values are JSON. Reads never throw (private mode, quota, corrupt data -> fallback).
 */
export const STORAGE_KEYS = {
  cart: 'quran_cart',
  settings: 'quran_settings',
  bookmark: 'quran_bookmark',
  khatma: 'quran_khatma',
  lastRoute: 'quran_last_route',
  /** Audio player preferences (reciter, volume, repeat, playback mode). Not part of spec §3. */
  audio: 'quran_audio',
  /** Cart ayah ids the user explicitly set to «بدون تفسير» (others default to the first book). */
  cartNoTafsir: 'quran_cart_no_tafsir',
  /** Last listening position (what, which reciter, where, playing or paused). Metadata only. */
  audioSession: 'quran_audio_session',
} as const;

export function getItem<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function setItem<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or blocked: the in-memory state still works for this session
  }
}

export function removeItem(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/**
 * Runs in <head> before first paint (layout.tsx) so the theme and font size never flash.
 * Same rules as the settings store: a valid saved theme wins, otherwise the device preference.
 * It lives here because it reads localStorage (this module is the only place that may).
 */
export const BOOT_SCRIPT = `(function(){try{var r=document.documentElement,s=null;try{s=JSON.parse(localStorage.getItem('${STORAGE_KEYS.settings}')||'null')}catch(e){}var t=s&&(s.theme==='dark'||s.theme==='light')?s.theme:(window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');r.classList.toggle('dark',t==='dark');r.style.colorScheme=t;var f=s&&typeof s.fontSize==='number'&&s.fontSize>=16&&s.fontSize<=32?s.fontSize:22;r.style.setProperty('--quran-size',f+'px')}catch(e){}})();`;
