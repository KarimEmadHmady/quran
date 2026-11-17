import { MAX_KHATMA_DAYS, TOTAL_AYAHS, type Khatma } from './shapes';

/**
 * Khatma (spec 4.3, claude.md 11.15), pure functions over the `quran_khatma` shape:
 *  - reading is sequential in mushaf order; `lastAyahId` = last ayah marked "تمت القراءة"
 *  - marking an ayah at or before `lastAyahId` changes nothing (no double completion)
 *  - day n (0-based) of the plan covers ayahs (n*target, (n+1)*target]; a day goes into
 *    `completedDates` only once `lastAyahId` reaches the end of that day's portion
 */

export const REMINDER_HOUR = 20;

/** Local calendar date "YYYY-MM-DD". */
export function localDate(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Whole days from a to b (both "YYYY-MM-DD"); negative when b is before a. */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function createKhatma(durationDays: number, today: string): Khatma {
  if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > MAX_KHATMA_DAYS) {
    throw new RangeError(`durationDays must be 1..${MAX_KHATMA_DAYS}`);
  }
  return {
    startDate: today,
    durationDays,
    dailyTargetAyahs: Math.ceil(TOTAL_AYAHS / durationDays),
    lastAyahId: 0,
    completedDates: [],
  };
}

/** 0-based day of the plan (0 before/at the start date). */
export function dayIndex(k: Khatma, today: string): number {
  return Math.max(0, daysBetween(k.startDate, today));
}

/** Today's portion: ayah ids from..to (inclusive). After the planned end it is "the rest". */
export function todayPortion(k: Khatma, today: string): { from: number; to: number } {
  const d = dayIndex(k, today);
  const to = d >= k.durationDays - 1 ? TOTAL_AYAHS : Math.min(TOTAL_AYAHS, (d + 1) * k.dailyTargetAyahs);
  const from = Math.min(TOTAL_AYAHS, d * k.dailyTargetAyahs) + 1;
  return { from: Math.min(from, to), to };
}

export function isFinished(k: Khatma): boolean {
  return k.lastAyahId >= TOTAL_AYAHS;
}

/** Today's full target is reached (the schedule's end for today, catch-up included). */
export function isTodayDone(k: Khatma, today: string): boolean {
  return k.lastAyahId >= todayPortion(k, today).to;
}

/** Adds today to completedDates once its target is reached (never twice). */
export function syncCompletion(k: Khatma, today: string): Khatma {
  if (!isTodayDone(k, today) || k.completedDates.includes(today)) return k;
  return { ...k, completedDates: [...k.completedDates, today].sort() };
}

/**
 * "تمت القراءة" on an ayah: everything up to it is read. Returns the SAME object when nothing
 * changes (already read, or an invalid id), so callers can skip writes.
 */
export function markRead(k: Khatma, ayahId: number, today: string): Khatma {
  if (!Number.isInteger(ayahId) || ayahId <= k.lastAyahId || ayahId > TOTAL_AYAHS) return k;
  return syncCompletion({ ...k, lastAyahId: ayahId }, today);
}

/** 0..1 */
export function progress(k: Khatma): number {
  return Math.min(1, k.lastAyahId / TOTAL_AYAHS);
}

/** Ayahs ahead (+) or behind (-) the schedule at the start of today. */
export function scheduleDelta(k: Khatma, today: string): number {
  const expected = Math.min(TOTAL_AYAHS, dayIndex(k, today) * k.dailyTargetAyahs);
  return k.lastAyahId - expected;
}

/** Evening reminder (spec 4.3): today not done yet and it is late in the day. */
export function shouldRemind(k: Khatma, now: Date): boolean {
  return !isFinished(k) && !isTodayDone(k, localDate(now)) && now.getHours() >= REMINDER_HOUR;
}

/** Consecutive completed days ending today or yesterday. */
export function streak(k: Khatma, today: string): number {
  const done = new Set(k.completedDates);
  let day = done.has(today) ? today : shiftDate(today, -1);
  let n = 0;
  while (done.has(day)) {
    n++;
    day = shiftDate(day, -1);
  }
  return n;
}

export function shiftDate(date: string, days: number): string {
  const d = new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}
