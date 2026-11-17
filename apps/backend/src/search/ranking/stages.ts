/**
 * Pure matching/scoring helpers for the text stages of claude.md 5.6:
 *   stage 1  phrase     contiguous, in order              weight 100
 *   stage 2  ordered    in order, gaps allowed (window)   weight 80
 *   stage 3  all_terms  every word, any order             weight 60
 * Reference hits (stage 0) sit above all of them.
 */

export type TextStage = 'phrase' | 'ordered' | 'all_terms' | 'corrected' | 'partial' | 'loose';

/**
 * claude.md 5.6. Stage 4 `corrected` = stages 1-3 after phonetic/edit/merge/split
 * corrections; stage 6 `loose` = a skeleton correction was needed (the MySQL FULLTEXT part of
 * stage 6 is not implemented, see claude.md 11.11); stage 5 `partial` = at least
 * PARTIAL_MIN_COVERAGE of the query words found (incomplete recitation, 5.10).
 */
export const STAGE_WEIGHT = {
  reference: 200,
  phrase: 100,
  ordered: 80,
  all_terms: 60,
  corrected: 40,
  partial: 25,
  loose: 10,
} as const;

/**
 * Stage 2 "small window" (5.6): the ordered words may spread over at most
 * ORDERED_WINDOW_FACTOR x the query length. Wider spreads fall to stage 3.
 */
export const ORDERED_WINDOW_FACTOR = 3;

/** 5.6: "stop once a strong stage has gathered enough results (>= 10 for example)". */
export const MIN_RESULTS = 10;

/** Stage 5 `partial`: share of the query words that must be found (5.6: >= 60%). */
export const PARTIAL_MIN_COVERAGE = 0.6;

export interface WindowMatch {
  /** Words covered, first to last (inclusive count). */
  span: number;
  /** Positions of the query words inside the window (ascending, unique). */
  words: number[];
}

/**
 * Smallest window holding the query words IN ORDER (each at a later position than the
 * previous). `lists[k]` = ascending positions of query word k in the doc.
 * For each start, the greedy earliest-next choice gives the smallest end for that start.
 */
export function orderedWindow(lists: readonly ArrayLike<number>[]): WindowMatch | null {
  if (lists.length === 0 || lists.some((l) => l.length === 0)) return null;
  let best: WindowMatch | null = null;
  for (let i = 0; i < lists[0].length; i++) {
    const words = [lists[0][i]];
    for (let k = 1; k < lists.length; k++) {
      const prev = words[k - 1];
      const l = lists[k];
      let next = -1;
      for (let j = 0; j < l.length; j++) {
        if (l[j] > prev) {
          next = l[j];
          break;
        }
      }
      if (next === -1) break;
      words.push(next);
    }
    if (words.length < lists.length) break; // later starts cannot do better
    const span = words[words.length - 1] - words[0] + 1;
    if (!best || span < best.span) best = { span, words };
  }
  return best;
}

/**
 * Smallest window holding every DISTINCT query word at least `need[k]` times, in any order
 * (classic minimum covering window). Returns all query-word positions inside it.
 */
export function anyOrderWindow(
  lists: readonly ArrayLike<number>[],
  need: readonly number[],
): WindowMatch | null {
  if (lists.length === 0 || lists.some((l, k) => l.length < need[k])) return null;
  const events: { pos: number; k: number }[] = [];
  lists.forEach((l, k) => {
    for (let j = 0; j < l.length; j++) events.push({ pos: l[j], k });
  });
  events.sort((a, b) => a.pos - b.pos);

  const have = new Array<number>(lists.length).fill(0);
  let satisfied = 0;
  let best: { lo: number; hi: number } | null = null;
  let lo = 0;
  for (let hi = 0; hi < events.length; hi++) {
    const k = events[hi].k;
    if (++have[k] === need[k]) satisfied++;
    while (satisfied === lists.length) {
      const span = events[hi].pos - events[lo].pos + 1;
      if (!best || span < events[best.hi].pos - events[best.lo].pos + 1) best = { lo, hi };
      const kl = events[lo].k;
      if (have[kl]-- === need[kl]) satisfied--;
      lo++;
    }
  }
  /* istanbul ignore next -- unreachable: every list has >= need[k] positions */
  if (!best) return null;
  const words = events.slice(best.lo, best.hi + 1).map((e) => e.pos);
  return { span: events[best.hi].pos - events[best.lo].pos + 1, words };
}

export interface ScoreInput {
  stage: TextStage;
  /** Sum of IDF of the distinct query words (all present in stages 1-3). */
  idfSum: number;
  queryLength: number;
  docLength: number;
  /** Words covered by the best window (= queryLength for a phrase). */
  span: number;
  /** Fraction of query words found (1 for stages 1-3; later stages go lower). */
  coverage: number;
}

/**
 * claude.md 5.6:
 *   score = stageWeight + Σ idf·quality + proximityBonus + coverage·20 − lengthPenalty
 * quality is 1.0 (exact words) until Phase 3 adds corrections.
 * proximityBonus ∈ (0, 10]: 10 when the words are adjacent.
 * lengthPenalty ∈ [0, 10]: a long ayah against a short query loses a little.
 */
export function scoreMatch(s: ScoreInput): number {
  const proximity = 10 * Math.min(1, s.queryLength / Math.max(s.span, 1));
  const ratio = s.docLength / Math.max(s.queryLength, 1);
  const lengthPenalty = ratio > 1 ? Math.min(10, 2 * Math.log(ratio)) : 0;
  const score = STAGE_WEIGHT[s.stage] + s.idfSum + proximity + s.coverage * 20 - lengthPenalty;
  return Math.round(score * 100) / 100;
}

/**
 * A reference hit outranks every text hit of the same query: the reference weight plus the
 * largest bonus a text match can get (all IDF + full proximity + full coverage).
 */
export function referenceScore(idfSum: number): number {
  return Math.round((STAGE_WEIGHT.reference + idfSum + 30) * 100) / 100;
}
