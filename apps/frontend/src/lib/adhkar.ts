/**
 * Pure adhkar helpers (no React, no storage): stored-shape parsing, counter periods and
 * reminder timing. Everything read from localStorage goes through a parser here; anything
 * malformed is treated as absent.
 */
import type { ReminderDefinition, ReminderKey } from './adhkarApi';

export const REMINDER_KEYS: readonly ReminderKey[] = ['morning', 'evening', 'sleep', 'wake'];
export const MAX_FAVORITES = 300;
export const MAX_RECENT = 5;
/** A reminder that was missed (app closed) still fires if the app is opened within this window. */
export const REMINDER_GRACE_MINUTES = 120;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const TIME = /^([01][0-9]|2[0-3]):([0-5][0-9])$/;
const FAV = /^[1-9][0-9]{0,4}:[1-9][0-9]{0,4}$/;

export const dhikrKey = (categoryId: number, itemNumber: number) => `${categoryId}:${itemNumber}`;

export function parseDhikrKey(key: string): { categoryId: number; itemNumber: number } | null {
  if (!FAV.test(key)) return null;
  const [c, n] = key.split(':').map(Number);
  return { categoryId: c, itemNumber: n };
}

export function localDate(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ------------------------------------------------------------------ favourites / recent

export function parseFavorites(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((x): x is string => typeof x === 'string' && FAV.test(x)))].slice(0, MAX_FAVORITES);
}

export interface RecentCategory {
  id: number;
  title: string;
  at: string;
}

export function parseRecent(v: unknown): RecentCategory[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(
      (x): x is RecentCategory =>
        isObj(x) &&
        Number.isInteger(x.id) &&
        (x.id as number) > 0 &&
        typeof x.title === 'string' &&
        x.title.length > 0 &&
        x.title.length <= 255 &&
        typeof x.at === 'string',
    )
    .slice(0, MAX_RECENT);
}

// ------------------------------------------------------------------ counters

/** Categories read twice a day: the counter restarts for the evening session. */
const TWICE_DAILY = new Set([1]); // «أذكار الصباح والمساء»
/** Hour (local) from which category 1 counts as the evening adhkar. */
export const EVENING_FROM_HOUR = 15;

/**
 * The period a category's counters belong to: one day, or (morning & evening adhkar) half a day.
 * Counters of an older period are discarded, so every new day / session starts at zero.
 */
export function progressPeriod(categoryId: number, now = new Date()): string {
  const day = localDate(now);
  if (!TWICE_DAILY.has(categoryId)) return day;
  return `${day}-${now.getHours() >= EVENING_FROM_HOUR ? 'pm' : 'am'}`;
}

export interface CategoryProgress {
  period: string;
  /** itemNumber -> taps done */
  counts: Record<string, number>;
}
export type AdhkarProgress = Record<string, CategoryProgress>;

export function parseProgress(v: unknown): AdhkarProgress {
  if (!isObj(v)) return {};
  const out: AdhkarProgress = {};
  for (const [cid, p] of Object.entries(v)) {
    if (!/^[1-9][0-9]{0,4}$/.test(cid) || !isObj(p) || typeof p.period !== 'string' || !isObj(p.counts)) continue;
    const counts: Record<string, number> = {};
    for (const [n, c] of Object.entries(p.counts)) {
      if (/^[1-9][0-9]{0,4}$/.test(n) && Number.isInteger(c) && (c as number) > 0 && (c as number) <= 100_000) {
        counts[n] = c as number;
      }
    }
    out[cid] = { period: p.period, counts };
  }
  return out;
}

// ------------------------------------------------------------------ reminders

export interface ReminderPref {
  enabled: boolean;
  /** "HH:MM" local time. */
  time: string;
}
export type ReminderPrefs = Partial<Record<ReminderKey, ReminderPref>>;
export type RemindersFired = Partial<Record<ReminderKey, string>>;

export const isTime = (v: unknown): v is string => typeof v === 'string' && TIME.test(v);

export function parseReminderPrefs(v: unknown): ReminderPrefs {
  if (!isObj(v)) return {};
  const out: ReminderPrefs = {};
  for (const k of REMINDER_KEYS) {
    const p = v[k];
    if (isObj(p) && typeof p.enabled === 'boolean' && isTime(p.time)) out[k] = { enabled: p.enabled, time: p.time };
  }
  return out;
}

export function parseRemindersFired(v: unknown): RemindersFired {
  if (!isObj(v)) return {};
  const out: RemindersFired = {};
  for (const k of REMINDER_KEYS) {
    const d = v[k];
    if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) out[k] = d;
  }
  return out;
}

/** The user's setting for a slot, or the default (disabled, server default time). */
export function effectivePref(def: ReminderDefinition, prefs: ReminderPrefs): ReminderPref {
  return prefs[def.key] ?? { enabled: false, time: isTime(def.defaultTime) ? def.defaultTime : '06:00' };
}

/** Today's reminder moment for "HH:MM" (local time). */
export function reminderMoment(time: string, now = new Date()): Date {
  const [h, m] = time.split(':').map(Number);
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  return d;
}

/** True between the reminder time and the end of the grace window (same day). */
export function isReminderWindow(time: string, now = new Date()): boolean {
  const at = reminderMoment(time, now).getTime();
  const t = now.getTime();
  return t >= at && t - at < REMINDER_GRACE_MINUTES * 60_000;
}

/** Slots that should notify now: enabled, inside their window, and not yet notified today. */
export function dueReminders(
  defs: ReminderDefinition[],
  prefs: ReminderPrefs,
  fired: RemindersFired,
  now = new Date(),
): ReminderDefinition[] {
  const today = localDate(now);
  return defs.filter((d) => {
    const p = effectivePref(d, prefs);
    return p.enabled && isReminderWindow(p.time, now) && fired[d.key] !== today;
  });
}

/** Where a reminder notification leads. */
export const reminderHref = (d: ReminderDefinition) => `/adhkar/${d.categoryId}`;

/** "06:30" -> "6:30 ص" */
export function formatTime(time: string): string {
  if (!isTime(time)) return time;
  const [h, m] = time.split(':').map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'ص' : 'م'}`;
}
