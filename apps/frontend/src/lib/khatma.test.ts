import { describe, expect, it } from 'vitest';
import {
  createKhatma,
  dayIndex,
  daysBetween,
  isFinished,
  isTodayDone,
  localDate,
  markRead,
  progress,
  scheduleDelta,
  shiftDate,
  shouldRemind,
  streak,
  syncCompletion,
  todayPortion,
} from './khatma';
import { TOTAL_AYAHS } from './shapes';

const D0 = '2026-11-01';

describe('khatma (spec 4.3)', () => {
  it('creates the plan: daily target = ceil(6236 / days)', () => {
    expect(createKhatma(30, D0)).toEqual({
      startDate: D0,
      durationDays: 30,
      dailyTargetAyahs: 208,
      lastAyahId: 0,
      completedDates: [],
    });
    expect(() => createKhatma(0, D0)).toThrow(RangeError);
    expect(() => createKhatma(1.5, D0)).toThrow(RangeError);
  });

  it("today's portion follows the schedule; the last day takes the rest", () => {
    const k = createKhatma(30, D0);
    expect(todayPortion(k, D0)).toEqual({ from: 1, to: 208 });
    expect(todayPortion(k, '2026-11-02')).toEqual({ from: 209, to: 416 });
    expect(todayPortion(k, '2026-11-30')).toEqual({ from: 6033, to: TOTAL_AYAHS });
    expect(todayPortion(k, '2027-01-01').to).toBe(TOTAL_AYAHS); // overdue
    expect(dayIndex(k, '2026-10-01')).toBe(0); // before the start
  });

  it('marking an ayah advances lastAyahId; already-read ayahs change nothing (same object)', () => {
    const k = createKhatma(30, D0);
    const a = markRead(k, 50, D0);
    expect(a.lastAyahId).toBe(50);
    expect(markRead(a, 50, D0)).toBe(a); // duplicate
    expect(markRead(a, 10, D0)).toBe(a); // behind
    expect(markRead(a, 0, D0)).toBe(a);
    expect(markRead(a, TOTAL_AYAHS + 1, D0)).toBe(a);
    expect(markRead(a, 1.5, D0)).toBe(a);
  });

  it('a day is completed only when its FULL target is reached, once', () => {
    let k = createKhatma(30, D0);
    k = markRead(k, 207, D0);
    expect(isTodayDone(k, D0)).toBe(false);
    expect(k.completedDates).toEqual([]);
    k = markRead(k, 208, D0);
    expect(k.completedDates).toEqual([D0]);
    k = markRead(k, 300, D0);
    expect(k.completedDates).toEqual([D0]); // never twice
  });

  it('behind schedule: today needs the catch-up too', () => {
    let k = createKhatma(30, D0);
    const day3 = '2026-11-03'; // target end: 624
    k = markRead(k, 400, day3);
    expect(k.completedDates).toEqual([]);
    expect(scheduleDelta(k, day3)).toBe(400 - 416);
    k = markRead(k, 624, day3);
    expect(k.completedDates).toEqual([day3]);
  });

  it('ahead of schedule: a later day counts once its target is already reached', () => {
    let k = markRead(createKhatma(30, D0), 500, D0);
    expect(k.completedDates).toEqual([D0]);
    k = syncCompletion(k, '2026-11-02'); // target 416 <= 500
    expect(k.completedDates).toEqual([D0, '2026-11-02']);
    expect(syncCompletion(k, '2026-11-03')).toBe(k); // 624 > 500: not done
  });

  it('progress, finish, streak and the evening reminder', () => {
    let k = createKhatma(1, D0);
    expect(progress(k)).toBe(0);
    k = markRead(k, TOTAL_AYAHS, D0);
    expect(isFinished(k)).toBe(true);
    expect(progress(k)).toBe(1);

    const s = { ...createKhatma(30, D0), completedDates: ['2026-11-01', '2026-11-02', '2026-11-04', '2026-11-05'] };
    expect(streak(s, '2026-11-05')).toBe(2);
    expect(streak(s, '2026-11-06')).toBe(2); // today not done yet: yesterday's streak
    expect(streak(s, '2026-11-08')).toBe(0);

    const fresh = createKhatma(30, localDate(new Date(2026, 10, 1, 21)));
    expect(shouldRemind(fresh, new Date(2026, 10, 1, 21))).toBe(true);
    expect(shouldRemind(fresh, new Date(2026, 10, 1, 9))).toBe(false);
    expect(shouldRemind(k, new Date(2026, 10, 1, 21))).toBe(false); // finished
  });

  it('date helpers are calendar based (no DST drift)', () => {
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(daysBetween('2026-11-02', '2026-11-01')).toBe(-1);
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
    expect(localDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});
