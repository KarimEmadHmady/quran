import { normalize } from '@quran/text-utils';

/**
 * Word alignment between text_simple (what the index matches) and text_uthmani (what is
 * displayed and highlighted). claude.md 5.8.
 *
 * Offsets are UTF-16 code units, i.e. exactly what JavaScript String.prototype.slice()
 * and DOM Range offsets use. (The corpus has no astral characters, so they also equal code
 * point offsets; a real-DB test asserts that.)
 *
 * Usually word i of text_simple is word i of text_uthmani. Where the counts differ, the
 * Uthmani script writes several simple words as one (vocative "يا" + noun, "ها أنتم",
 * "وأن لو", "يا ابن أم"), or text_uthmani carries extra words (97:1 starts with the basmala).
 * A monotonic dynamic-programming alignment handles all of these with one algorithm:
 *   1 simple word  <-> 1 Uthmani word
 *   2..3 simple words <-> 1 Uthmani word (the Uthmani word is split at letter boundaries)
 *   an Uthmani word with no simple word (skipped)
 * Simple words are never skipped: every one gets a span.
 */

export interface Span {
  /** Inclusive start, UTF-16 code units. */
  start: number;
  /** Exclusive end, UTF-16 code units. */
  end: number;
}

export interface AlignmentGroup {
  simpleStart: number;
  simpleCount: number;
  uthmaniIndex: number;
}

export type AlignmentMethod = 'positional' | 'dp' | 'fallback';

export interface AyahAlignment {
  /** positional: counts equal and every pair matched; dp: aligned by dynamic programming;
   *  fallback: no valid alignment existed, every word spans the whole ayah (never happens on
   *  the current corpus; tests assert it). */
  method: AlignmentMethod;
  simpleCount: number;
  /** Span of every Uthmani word. */
  uthmaniWords: readonly Span[];
  /** Span of every simple word (a sub-span when several share one Uthmani word). */
  spans: readonly Span[];
  /** Uthmani word index of every simple word. */
  uthmaniIndexOf: readonly number[];
  /** Uthmani words that receive two or more simple words. */
  merges: readonly AlignmentGroup[];
  /** Uthmani words with no simple word (97:1: the basmala). */
  unmappedUthmani: readonly number[];
}

// ---------------------------------------------------------------- characters

/** Arabic combining marks (tashkeel, dagger alef, Quranic annotation signs). */
export function isCombiningMark(code: number): boolean {
  return (
    (code >= 0x064b && code <= 0x065f) || code === 0x0670 || (code >= 0x06d6 && code <= 0x06ed)
  );
}

const TATWEEL = 0x0640;
const ALEF = String.fromCharCode(0x0627);
const ALEF_WASLA = 0x0671;

/** Letters only: marks and tatweel dropped, alef wasla -> alef, hamza forms KEPT. */
export function letterKey(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (isCombiningMark(code) || code === TATWEEL) continue;
    out += code === ALEF_WASLA ? ALEF : text[i];
  }
  return out;
}

/** Spelling-insensitive key: normalize() without alef or spaces (Uthmani omits many alefs). */
export function skeleton(text: string): string {
  return normalize(text).split(ALEF).join('').split(' ').join('');
}

/**
 * Skeletons of each word. Normalizes the whole text once (much faster than per word) and
 * falls back to per-word normalization if that would change the word count.
 */
export function wordSkeletons(words: readonly string[]): string[] {
  const joined = normalize(words.join(' ')).split(' ');
  if (joined.length === words.length && joined.every((w) => w !== '')) {
    return joined.map((w) => w.split(ALEF).join(''));
  }
  return words.map(skeleton);
}

// Reusable rows for levenshtein(): the alignment calls it hundreds of thousands of times, and
// allocating two arrays per call dominated the build time. Grown on demand; single-threaded.
let rowA = new Uint16Array(64);
let rowB = new Uint16Array(64);

/** Levenshtein distance (strings up to 65535 chars). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  if (rowA.length <= b.length) {
    rowA = new Uint16Array(b.length * 2 + 1);
    rowB = new Uint16Array(b.length * 2 + 1);
  }
  let prev = rowA;
  let cur = rowB;
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      const sub = prev[j - 1] + (ca === b.charCodeAt(j - 1) ? 0 : 1);
      const del = prev[j] + 1;
      const ins = cur[j - 1] + 1;
      cur[j] = sub < del ? (sub < ins ? sub : ins) : del < ins ? del : ins;
    }
    const t = prev;
    prev = cur;
    cur = t;
  }
  return prev[b.length];
}

/** 0 = same skeleton, 1 = nothing in common. */
function keyDistance(a: string, b: string): number {
  return levenshtein(a, b) / Math.max(a.length, b.length, 1);
}

// ---------------------------------------------------------------- tokens

/** Spans of the space-separated words of a text. */
export function wordSpans(text: string): Span[] {
  const spans: Span[] = [];
  let start = -1;
  for (let i = 0; i <= text.length; i++) {
    const isSpace = i === text.length || /\s/.test(text[i]);
    if (!isSpace && start === -1) start = i;
    else if (isSpace && start !== -1) {
      spans.push({ start, end: i });
      start = -1;
    }
  }
  return spans;
}

// ---------------------------------------------------------------- alignment

const MERGE_PENALTY = [0, 0, 0.15, 0.3]; // index = number of simple words in one Uthmani word
const SKIP_COST = 0.75; // an Uthmani word with no simple word
const MAX_MERGE = 3;
/** Above this skeleton distance a positional pair is not trusted and DP runs instead. */
export const POSITIONAL_MAX_DISTANCE = 0.75;
/**
 * DP band: how far the path may drift from the straight line between (0,0) and (m,n).
 * Merges move it one way, skipped Uthmani words the other; in the real corpus the drift is
 * at most 2 (two merges in one ayah), so 6 is generous. Tests compare against an unbanded run.
 */
export const DP_BAND = 6;

export interface AlignOptions {
  /** Always run DP (used by tests to prove the positional shortcut never differs). */
  forceDp?: boolean;
  /** Override the DP band (Infinity = full matrix; used by tests). */
  band?: number;
}

/** Splits one Uthmani word into `parts.length` non-empty spans at letter boundaries. */
function splitWord(uthmani: string, word: Span, parts: readonly string[]): Span[] | null {
  const boundaries: number[] = [];
  for (let i = word.start + 1; i < word.end; i++) {
    if (!isCombiningMark(uthmani.charCodeAt(i))) boundaries.push(i);
  }
  if (boundaries.length < parts.length - 1) return null;

  const keys = parts.map(letterKey);
  const cost = (cuts: number[]) => {
    const edges = [word.start, ...cuts, word.end];
    let total = 0;
    for (let p = 0; p < parts.length; p++) {
      total += levenshtein(letterKey(uthmani.slice(edges[p], edges[p + 1])), keys[p]);
    }
    return total;
  };

  let best: number[] = [];
  let bestCost = Infinity;
  const search = (from: number, cuts: number[]) => {
    if (cuts.length === parts.length - 1) {
      const c = cost(cuts);
      if (c < bestCost) [best, bestCost] = [cuts, c]; // strict: earliest split wins ties
      return;
    }
    for (let b = from; b < boundaries.length; b++) search(b + 1, [...cuts, boundaries[b]]);
  };
  search(0, []);

  const edges = [word.start, ...best, word.end];
  return parts.map((_, p) => ({ start: edges[p], end: edges[p + 1] }));
}

function fallback(simpleCount: number, uthmani: string, uthmaniWords: Span[]): AyahAlignment {
  const whole = { start: 0, end: uthmani.length };
  return {
    method: 'fallback',
    simpleCount,
    uthmaniWords,
    spans: Array.from({ length: simpleCount }, () => whole),
    uthmaniIndexOf: Array.from({ length: simpleCount }, () => 0),
    merges: [],
    unmappedUthmani: [],
  };
}

export function alignAyah(
  simple: string,
  uthmani: string,
  options: AlignOptions = {},
): AyahAlignment {
  const simpleWords = simple.trim() === '' ? [] : simple.trim().split(/\s+/);
  const uthmaniWords = wordSpans(uthmani);
  const m = simpleWords.length;
  const n = uthmaniWords.length;
  const uKeys = wordSkeletons(uthmaniWords.map((w) => uthmani.slice(w.start, w.end)));
  const sKeys = wordSkeletons(simpleWords);

  // Fast path: same word count and every pair plausibly the same word.
  if (
    !options.forceDp &&
    m === n &&
    sKeys.every((k, i) => keyDistance(k, uKeys[i]) <= POSITIONAL_MAX_DISTANCE)
  ) {
    return {
      method: 'positional',
      simpleCount: m,
      uthmaniWords,
      spans: uthmaniWords.map((w) => ({ ...w })),
      uthmaniIndexOf: simpleWords.map((_, i) => i),
      merges: [],
      unmappedUthmani: [],
    };
  }

  // Skeletons of k consecutive simple words ending at i (k = 1..3), computed once.
  const runKey = (end: number, k: number) => skeleton(simpleWords.slice(end - k, end).join(''));
  const runKeys: string[][] = [[], [], [], []];
  for (let k = 1; k <= MAX_MERGE; k++) {
    for (let i = k; i <= m; i++) runKeys[k][i] = k === 1 ? sKeys[i - 1] : runKey(i, k);
  }

  const width = n + 1;
  const dp = new Float64Array((m + 1) * width).fill(Infinity);
  const move = new Int8Array((m + 1) * width).fill(-1); // 0 = skip Uthmani word, k = k simple words
  dp[0] = 0;
  // Only cells whose drift d = i - j lies within the band around [min(0, m-n), max(0, m-n)].
  const band = options.band ?? DP_BAND;
  const dLow = Math.min(0, m - n) - band;
  const dHigh = Math.max(0, m - n) + band;
  for (let i = 0; i <= m; i++) {
    const jFrom = Math.max(1, i - dHigh);
    const jTo = Math.min(n, i - dLow);
    for (let j = jFrom; j <= jTo; j++) {
      const at = i * width + j;
      const skip = dp[at - 1] + SKIP_COST;
      if (skip < dp[at]) [dp[at], move[at]] = [skip, 0];
      for (let k = 1; k <= MAX_MERGE && k <= i; k++) {
        const prev = dp[(i - k) * width + j - 1];
        if (prev === Infinity) continue;
        const c = prev + keyDistance(runKeys[k][i], uKeys[j - 1]) + MERGE_PENALTY[k];
        if (c < dp[at]) [dp[at], move[at]] = [c, k];
      }
    }
  }
  if (dp[m * width + n] === Infinity) return fallback(m, uthmani, uthmaniWords);

  const spans: Span[] = new Array<Span>(m);
  const uthmaniIndexOf: number[] = new Array<number>(m);
  const merges: AlignmentGroup[] = [];
  const unmappedUthmani: number[] = [];
  for (let i = m, j = n; j > 0; j--) {
    const k = move[i * width + j];
    const u = j - 1;
    if (k === 0) {
      unmappedUthmani.unshift(u);
      continue;
    }
    const start = i - k;
    const parts =
      k === 1
        ? [uthmaniWords[u]]
        : splitWord(uthmani, uthmaniWords[u], simpleWords.slice(start, i));
    if (!parts) return fallback(m, uthmani, uthmaniWords);
    for (let p = 0; p < k; p++) {
      spans[start + p] = parts[p];
      uthmaniIndexOf[start + p] = u;
    }
    if (k > 1) merges.unshift({ simpleStart: start, simpleCount: k, uthmaniIndex: u });
    i = start;
  }

  return {
    method: 'dp',
    simpleCount: m,
    uthmaniWords,
    spans,
    uthmaniIndexOf,
    merges,
    unmappedUthmani,
  };
}

/** Problems with an alignment (empty when valid). Used by tests and by the map's stats. */
export function validateAlignment(a: AyahAlignment, uthmani: string): string[] {
  const problems: string[] = [];
  if (a.spans.length !== a.simpleCount) problems.push('span count != simple word count');
  let prevEnd = 0;
  a.spans.forEach((s, i) => {
    const text = uthmani.slice(s.start, s.end);
    if (!(s.start >= 0 && s.end <= uthmani.length && s.start < s.end))
      problems.push(`word ${i}: empty or out of bounds`);
    if (s.start < prevEnd) problems.push(`word ${i}: overlaps or out of order`);
    if (/\s/.test(text)) problems.push(`word ${i}: contains whitespace`);
    if (isCombiningMark(uthmani.charCodeAt(s.start)))
      problems.push(`word ${i}: starts on a combining mark`);
    if (s.end < uthmani.length && isCombiningMark(uthmani.charCodeAt(s.end)))
      problems.push(`word ${i}: cuts before a combining mark`);
    const host = a.uthmaniWords[a.uthmaniIndexOf[i]];
    if (!host || s.start < host.start || s.end > host.end)
      problems.push(`word ${i}: outside its Uthmani word`);
    prevEnd = s.end;
  });
  return problems;
}
