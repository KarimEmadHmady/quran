import type { Vocabulary } from '../index/vocabulary';
import { editDistance, maxEditCost } from '../text/edit-distance';
import { phonetic, skeleton } from '../text/phonetic';

/**
 * Token corrector (claude.md 5.5). The most important rule (5.1): a word that IS in the
 * vocabulary is never changed. Only out-of-vocabulary (OOV) words get candidates:
 *   1. in vocabulary          -> kept as is
 *   2. prefix                 -> only for /search/suggest (the user is still typing)
 *   3. phonetic               -> vocabulary words with the same phonetic() key
 *   4. edit distance          -> Damerau-Levenshtein on trigram candidates (5.5 thresholds,
 *                                cheaper keyboard-neighbour substitutions)
 *   5. skeleton               -> last resort, only when 3-4 found nothing
 *   6. merge / split          -> "ال رحمن" -> "الرحمن" (one side OOV), "قلهوالله" -> "قل هو الله"
 * Candidates rank by cost, then frequency (df), then same length.
 */

export type CorrectionKind =
  'phonetic' | 'edit1' | 'edit2' | 'skeleton' | 'merge' | 'split' | 'prefix';
export type OptionKind = 'exact' | CorrectionKind;

/** claude.md 5.6 matchQuality. merge/split are not listed there: treated like phonetic. */
export const MATCH_QUALITY: Record<OptionKind, number> = {
  exact: 1,
  phonetic: 0.85,
  edit1: 0.75,
  edit2: 0.6,
  skeleton: 0.4,
  merge: 0.85,
  split: 0.85,
  /** Not listed in 5.6: a cut-off last word (voice) is weighted like one edit. */
  prefix: 0.75,
};

const PHONETIC_COST = 0.5;
const SKELETON_COST = 3;
const MERGE_COST = 0.5;
const SPLIT_COST_PER_EXTRA_WORD = 0.5;
const CLITIC_COST = 0.5;
/** Candidates kept per word: every one within this much of the best ("show both", 5.12). */
const OPTION_COST_TOLERANCE = 0.5;
/** Measured on 1000 synthetic typos: 4 -> 96.1%, 8 -> 98.3%, 12 -> 98.9% R@5, same latency. */
const MAX_OPTIONS = 12;
/** Split parts must be real words of at least this length (avoids "ن" + "...") . */
const MIN_SPLIT_PART = 2;
const MAX_SPLIT_PARTS = 3;
const CLITICS = ['ال', 'و', 'ف', 'ب', 'ل'];
const PREFIX_COST = 0.5;
/** A cut-off word needs at least this many letters to be completed. */
const MIN_PREFIX = 3;

/** One correction, in the shape claude.md 5.5 asks for. */
export interface Correction {
  original: string;
  candidate: string;
  kind: CorrectionKind;
  cost: number;
}

export interface SlotOption {
  word: string;
  kind: OptionKind;
  cost: number;
  quality: number;
}

/** One position of the corrected query: the words acceptable there. */
export interface QuerySlot {
  /** The query text this slot came from. */
  original: string;
  /** Empty = nothing in the vocabulary is close enough (the slot cannot match). */
  options: SlotOption[];
  /** Slots produced by splitting one word share a group id. */
  splitGroup?: number;
}

export interface CorrectionPlan {
  slots: QuerySlot[];
  /** True when any slot is not an exact word of the query. */
  changed: boolean;
  /** Number of words that were split. */
  splits: number;
}

const isDigits = (w: string) => /^[0-9]+$/.test(w);
const exact = (word: string): SlotOption => ({ word, kind: 'exact', cost: 0, quality: 1 });

/** Sort: cost asc, df desc, closest length, then word (deterministic). */
function rank(vocab: Vocabulary, original: string, list: Correction[]): Correction[] {
  const df = (w: string) => vocab.get(w)?.df ?? 0;
  return list.sort(
    (a, b) =>
      a.cost - b.cost ||
      df(b.candidate) - df(a.candidate) ||
      Math.abs(a.candidate.length - original.length) -
        Math.abs(b.candidate.length - original.length) ||
      (a.candidate < b.candidate ? -1 : a.candidate > b.candidate ? 1 : 0),
  );
}

/**
 * Single-word candidates for an OOV word (steps 3-5), best first. Never called for a
 * vocabulary word; returns [] for words too short to correct safely.
 */
export interface CandidateOptions {
  /** Voice (5.7): wider edit thresholds. */
  voice?: boolean;
  /** 5.5 step 2: the word may be cut off (last word of a voice query): add completions. */
  prefix?: boolean;
}

export function wordCandidates(
  vocab: Vocabulary,
  word: string,
  { voice = false, prefix = false }: CandidateOptions = {},
): Correction[] {
  const found = new Map<string, Correction>();
  const offer = (candidate: string, kind: CorrectionKind, cost: number) => {
    if (candidate === word) return;
    const prev = found.get(candidate);
    if (!prev || cost < prev.cost) found.set(candidate, { original: word, candidate, kind, cost });
  };

  for (const w of vocab.byPhonetic(phonetic(word))) offer(w, 'phonetic', PHONETIC_COST);
  if (prefix && word.length >= MIN_PREFIX) {
    for (const w of vocab.withPrefix(word, MAX_OPTIONS)) offer(w, 'prefix', PREFIX_COST);
  }

  const max = maxEditCost(word.length, voice);
  if (max > 0) {
    for (const w of vocab.trigramNeighbours(word)) {
      const d = editDistance(word, w, max);
      if (d !== Infinity) offer(w, d <= 1 ? 'edit1' : 'edit2', d);
    }
    if (found.size === 0) {
      for (const w of vocab.bySkeleton(skeleton(word))) offer(w, 'skeleton', SKELETON_COST);
    }
  }
  return rank(vocab, word, [...found.values()]);
}

/** Best way to cut `word` into 2..MAX_SPLIT_PARTS vocabulary words (fewest parts first). */
function splitInto(vocab: Vocabulary, word: string, parts: number): string[] | null {
  if (parts === 1) return word.length >= MIN_SPLIT_PART && vocab.has(word) ? [word] : null;
  let best: string[] | null = null;
  let bestScore = -1;
  for (let i = MIN_SPLIT_PART; i <= word.length - MIN_SPLIT_PART; i++) {
    const head = word.slice(0, i);
    if (!vocab.has(head)) continue;
    const rest = splitInto(vocab, word.slice(i), parts - 1);
    if (!rest) continue;
    const candidate = [head, ...rest];
    // Prefer the split whose rarest part is most frequent (least likely to be accidental).
    const score = Math.min(...candidate.map((w) => vocab.get(w)!.df));
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

/** Step 6 (split): the word cut into vocabulary words, optionally after dropping a clitic. */
export function splitCandidate(
  vocab: Vocabulary,
  word: string,
): { words: string[]; cost: number } | null {
  const attempt = (w: string, extra: number) => {
    for (let parts = 2; parts <= MAX_SPLIT_PARTS; parts++) {
      const words = splitInto(vocab, w, parts);
      if (words) return { words, cost: extra + SPLIT_COST_PER_EXTRA_WORD * (parts - 1) };
    }
    return null;
  };
  const direct = attempt(word, 0);
  if (direct) return direct;
  for (const c of CLITICS) {
    if (!word.startsWith(c) || word.length - c.length < MIN_SPLIT_PART) continue;
    const rest = word.slice(c.length);
    if (vocab.has(rest)) return { words: [rest], cost: CLITIC_COST };
    const split = attempt(rest, CLITIC_COST);
    if (split) return split;
  }
  return null;
}

function optionsFrom(list: Correction[]): SlotOption[] {
  if (list.length === 0) return [];
  const limit = list[0].cost + OPTION_COST_TOLERANCE;
  return list
    .filter((c) => c.cost <= limit)
    .slice(0, MAX_OPTIONS)
    .map((c) => ({
      word: c.candidate,
      kind: c.kind,
      cost: c.cost,
      quality: MATCH_QUALITY[c.kind],
    }));
}

/**
 * The corrected query as slots. Vocabulary words and numbers stay exact; OOV words get
 * candidate options; merges/splits reshape the slots.
 *
 * Split is step 6 of 5.5: by default it is used only for a word with no single-word
 * candidate. With `preferSplit` (the caller's fallback when that reading found nothing,
 * e.g. "بسمالله" whose only candidates are unrelated edits) a possible split wins.
 *
 * `voice` (claude.md 5.7 / 5.10): wider edit thresholds, the last word may be cut off
 * (prefix completions), and two vocabulary words are merged when together they form a word
 * (STT splits words: "ال رحمن"). A single vocabulary word is still never replaced.
 */
export function planCorrection(
  vocab: Vocabulary,
  tokens: readonly string[],
  { preferSplit = false, voice = false }: { preferSplit?: boolean; voice?: boolean } = {},
): CorrectionPlan {
  const slots: QuerySlot[] = [];
  let changed = false;
  let splits = 0;
  let group = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const next = tokens[i + 1];
    // Merge: two neighbours that form a vocabulary word, at least one of them OOV.
    if (
      next !== undefined &&
      !isDigits(t) &&
      !isDigits(next) &&
      (voice || !vocab.has(t) || !vocab.has(next)) &&
      vocab.has(t + next)
    ) {
      slots.push({
        original: `${t} ${next}`,
        options: [
          { word: t + next, kind: 'merge', cost: MERGE_COST, quality: MATCH_QUALITY.merge },
        ],
      });
      changed = true;
      i++;
      continue;
    }
    if (vocab.has(t) || isDigits(t)) {
      slots.push({ original: t, options: isDigits(t) ? [] : [exact(t)] });
      continue;
    }
    changed = true;
    const options = optionsFrom(
      wordCandidates(vocab, t, { voice, prefix: voice && i === tokens.length - 1 }),
    );
    const split = options.length === 0 || preferSplit ? splitCandidate(vocab, t) : null;
    if (options.length > 0 && !split) {
      slots.push({ original: t, options });
      continue;
    }
    if (split) {
      splits++;
      group++;
      for (const w of split.words) {
        slots.push({
          original: t,
          splitGroup: group,
          options: [{ word: w, kind: 'split', cost: split.cost, quality: MATCH_QUALITY.split }],
        });
      }
      continue;
    }
    slots.push({ original: t, options: [] });
  }
  return { slots, changed, splits };
}

/**
 * "هل تقصد" neighbours of a VOCABULARY word (never applied automatically): same phonetic key
 * or one cheap edit away, best first.
 */
export function neighbours(vocab: Vocabulary, word: string, limit = 3): Correction[] {
  const found = new Map<string, Correction>();
  for (const w of vocab.byPhonetic(phonetic(word))) {
    if (w !== word)
      found.set(w, { original: word, candidate: w, kind: 'phonetic', cost: PHONETIC_COST });
  }
  if (maxEditCost(word.length) > 0) {
    for (const w of vocab.trigramNeighbours(word)) {
      if (w === word || found.has(w)) continue;
      const d = editDistance(word, w, 1);
      if (d !== Infinity) found.set(w, { original: word, candidate: w, kind: 'edit1', cost: d });
    }
  }
  return rank(vocab, word, [...found.values()]).slice(0, limit);
}
