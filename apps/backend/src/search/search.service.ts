import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { LruCache } from './cache/lru-cache';
import type { Span } from './index/alignment';
import { SearchIndexService, type SearchSnapshot } from './index/search-index.service';
import { tokenize } from './index/tokenize';
import { parseReference, type ReferenceParse } from './query/reference-parser';
import {
  neighbours,
  planCorrection,
  wordCandidates,
  type CorrectionKind,
  type CorrectionPlan,
  type SlotOption,
} from './query/token-corrector';
import {
  MIN_RESULTS,
  ORDERED_WINDOW_FACTOR,
  PARTIAL_MIN_COVERAGE,
  anyOrderWindow,
  orderedWindow,
  referenceScore,
  scoreMatch,
  type TextStage,
} from './ranking/stages';

/** claude.md 5.6 stages 0-4 and the skeleton part of 6 (stage 5 `partial` is not built). */
export type MatchType = 'reference' | TextStage;
export type Confidence = 'high' | 'medium' | 'low';

export const DEFAULT_SEARCH_LIMIT = 50;
/** claude.md 5.11 LRU: entries, lifetime, and the largest result list worth keeping. */
export const CACHE_MAX_ENTRIES = 200;
export const CACHE_TTL_MS = 5 * 60_000;
export const CACHE_MAX_HITS = 1000;
/** claude.md 5.11: /search/suggest returns the first 5 words. */
export const SUGGEST_LIMIT = 5;
/** "هل تقصد" suggestions returned at most. */
export const DID_YOU_MEAN_LIMIT = 3;

/** claude.md 5.7: 'voice' = wider tolerance, stronger merge/split, last-word prefix, `alts`. */
export type SearchType = 'text' | 'voice';
/** claude.md 5.10: Web Speech maxAlternatives=5. */
export const MAX_ALTS = 5;
/** Score handicap per STT alternative rank (the first transcript is the most likely). */
export const ALT_PENALTY = 2;

/** Stage order of 5.6: hits of different transcripts are merged in this order. */
const STAGE_ORDER: Record<MatchType, number> = {
  reference: 0,
  phrase: 1,
  ordered: 2,
  all_terms: 3,
  corrected: 4,
  partial: 5,
  loose: 6,
};

export interface SearchResultItem {
  ayahId: number;
  suraNumber: number;
  suraName: string;
  ayahNumber: number;
  /** "sura:ayah" */
  ref: string;
  textUthmani: string;
  matchType: MatchType;
  score: number;
  confidence: Confidence;
  /** text_simple word positions that matched (empty for a pure reference hit). */
  matchedWords: number[];
  /** The same positions as text_uthmani UTF-16 ranges (claude.md 5.8). */
  highlights: Span[];
}

/** What the query was understood as, when it looked like a reference at all. */
export type ReferenceInfo = Exclude<ReferenceParse, { status: 'none' }> & {
  /**
   * True for a bare sura name that is ALSO text found in the Quran ("الرحمن", "النور",
   * "يس"): the reference comes first, the text matches follow.
   */
  ambiguous: boolean;
};

/** claude.md 5.7 `corrected`: what was actually searched when OOV words were corrected. */
export interface CorrectedInfo {
  applied: true;
  /** The normalized query that produced the first result. */
  text: string;
  changes: { from: string; to: string; kind: CorrectionKind }[];
}

export interface SearchOutcome {
  query: {
    raw: string;
    normalized: string;
    /** Voice only: the STT alternatives received (normalized). */
    alternatives?: string[];
    /** Voice only: the transcript (q or an alt) that produced the first result. */
    selected?: string;
  };
  /** Set when OOV words were corrected automatically (claude.md 5.1 / 5.7); else null. */
  corrected: CorrectedInfo | null;
  /** Suggested queries when nothing matched and no correction was applied; else null. */
  didYouMean: string[] | null;
  /** null when the query is not a reference. */
  reference: ReferenceInfo | null;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  /** The requested page of the ranked results. */
  results: SearchResultItem[];
}

export interface SearchOptions {
  page?: number;
  limit?: number;
  type?: SearchType;
  /** Voice only: other STT transcripts, most likely first (claude.md 5.10). */
  alts?: readonly string[];
}

export interface Suggestion {
  /** The whole query with its last word completed or corrected. */
  text: string;
  word: string;
  kind: 'exact' | 'prefix' | CorrectionKind;
}

export interface SuggestOutcome {
  query: { raw: string; normalized: string };
  suggestions: Suggestion[];
}

/** A ranked hit before paging (highlights are computed only for the returned page). */
interface Hit {
  docIndex: number;
  matchType: MatchType;
  score: number;
  confidence: Confidence;
  words: number[];
}

/** Everything before paging; this is what the cache keeps. */
interface Ranked {
  hits: Hit[];
  reference: ReferenceInfo | null;
  corrected: CorrectedInfo | null;
  didYouMean: string[] | null;
}

const byScore = (a: Hit, b: Hit) => b.score - a.score || a.docIndex - b.docIndex;

const NO_CORRECTION: { groups: Hit[][]; corrected: CorrectedInfo | null } = {
  groups: [[], []],
  corrected: null,
};

/**
 * claude.md 5.10: search every STT transcript and merge, keeping each ayah's best hit
 * (stage order first, then score minus ALT_PENALTY per alternative rank). Reference /
 * corrected / didYouMean come from the transcript that produced the first result.
 */
function mergeVariants(list: readonly Ranked[]): { ranked: Ranked; from: number } {
  const best = new Map<number, { hit: Hit; from: number; adjusted: number }>();
  list.forEach((r, from) => {
    for (const hit of r.hits) {
      const adjusted = hit.score - ALT_PENALTY * from;
      const prev = best.get(hit.docIndex);
      const stage = STAGE_ORDER[hit.matchType];
      const prevStage = prev ? STAGE_ORDER[prev.hit.matchType] : Infinity;
      if (stage < prevStage || (stage === prevStage && adjusted > prev!.adjusted)) {
        best.set(hit.docIndex, { hit, from, adjusted });
      }
    }
  });
  const merged = [...best.values()].sort(
    (a, b) =>
      STAGE_ORDER[a.hit.matchType] - STAGE_ORDER[b.hit.matchType] ||
      b.adjusted - a.adjusted ||
      a.hit.docIndex - b.hit.docIndex,
  );
  const from = merged[0]?.from ?? 0;
  return { ranked: { ...list[from], hits: merged.map((m) => m.hit) }, from };
}

/** The query as it was typed, one exact slot per word (numbers match nothing). */
function exactPlan(tokens: readonly string[]): CorrectionPlan {
  return {
    slots: tokens.map((t) => ({
      original: t,
      options: /^[0-9]+$/.test(t) ? [] : [{ word: t, kind: 'exact' as const, cost: 0, quality: 1 }],
    })),
    changed: false,
    splits: 0,
  };
}

/**
 * Stage 5 `partial` (claude.md 5.6 / 5.10): ayahs holding at least PARTIAL_MIN_COVERAGE of the
 * query's slots (and at least 2), e.g. a recitation with a misheard or extra word. Each slot
 * may use any of its (corrected) options; a word filling several slots must occur that often.
 * Ranked by the 5.6 score, where coverage counts; always `low` confidence.
 */
function partialStage(
  snapshot: SearchSnapshot,
  plan: CorrectionPlan,
  exclude: ReadonlySet<number>,
): Hit[] {
  const { index } = snapshot;
  const n = plan.slots.length;
  const need = Math.max(2, Math.ceil(PARTIAL_MIN_COVERAGE * n));
  if (n < 3) return []; // with 1-2 words, partial = all terms (stages 2-4)

  // Group identical slots so a repeated word needs repeated occurrences.
  const groups = new Map<string, { options: SlotOption[]; size: number }>();
  for (const s of plan.slots) {
    if (s.options.length === 0) continue;
    const key = s.options.map((o) => o.word).join('\u0001');
    const g = groups.get(key);
    if (g) g.size++;
    else groups.set(key, { options: s.options, size: 1 });
  }
  const counts = new Map<number, number>();
  for (const g of groups.values()) {
    const docs = new Set<number>();
    for (const o of g.options) for (const d of index.postings(o.word)) docs.add(d);
    for (const d of docs) counts.set(d, (counts.get(d) ?? 0) + 1);
  }

  const hits: Hit[] = [];
  for (const docIndex of counts.keys()) {
    if (exclude.has(docIndex)) continue;
    let matched = 0;
    let weightedIdf = 0;
    const lists: Uint16Array[] = [];
    const needs: number[] = [];
    for (const g of groups.values()) {
      const best = g.options
        .map((o) => ({ o, p: index.positions(o.word, docIndex) }))
        .filter((x) => x.p.length > 0)
        .reduce<{ o: SlotOption; p: Uint16Array } | null>(
          (b, x) => (!b || x.o.quality > b.o.quality ? x : b),
          null,
        );
      if (!best) continue;
      const k = Math.min(g.size, best.p.length);
      matched += k;
      weightedIdf += k * (index.vocabulary.get(best.o.word)?.idf ?? 0) * best.o.quality;
      lists.push(best.p);
      needs.push(k);
    }
    if (matched < need) continue;
    const w = anyOrderWindow(lists, needs);
    /* istanbul ignore next -- every list holds at least `needs[k]` positions */
    if (!w) continue;
    hits.push({
      docIndex,
      matchType: 'partial',
      score: scoreMatch({
        stage: 'partial',
        idfSum: weightedIdf,
        queryLength: matched,
        docLength: index.doc(docIndex).length,
        span: w.span,
        coverage: matched / n,
      }),
      confidence: 'low',
      words: [...new Set(w.words)].sort((a, b) => a - b),
    });
  }
  return hits.sort(byScore);
}

/** Readings tried per ayah at most (options per slot are cost-ordered: cheapest first). */
const MAX_READINGS = 256;

/** One way to read the corrected query inside one ayah: one option per slot. */
interface Reading {
  chosen: SlotOption[];
  /** Sum of the options' correction costs. */
  cost: number;
  /** Sum of the options' positions in their slot's 5.5 ranking (cost, df, length). */
  rank: number;
  words: number[];
  score: (stage: TextStage) => number;
}

/**
 * The best reading of the corrected query in an ayah: the cheapest correction, then the
 * best-ranked candidates (claude.md 5.5: cost, frequency, length), then the highest 5.6 score. A word chosen by two slots must occur twice (as in stages 2-3), so
 * "الرحمن الرحم" reads as "الرحمن الرحيم" in 1:1, not as "الرحمن" matched twice.
 */
function bestReading(
  snapshot: SearchSnapshot,
  plan: CorrectionPlan,
  docIndex: number,
): Reading | null {
  const { index } = snapshot;
  const present = plan.slots.map((s) =>
    s.options.filter((o) => index.positions(o.word, docIndex).length > 0),
  );
  const n = present.length;
  const maxSpan = ORDERED_WINDOW_FACTOR * n;
  const docLength = index.doc(docIndex).length;
  let best: Reading | null = null;
  let bestScore = -Infinity;
  let tried = 0;
  const combo: SlotOption[] = [];

  const evaluate = () => {
    const distinct = [...new Set(combo.map((o) => o.word))];
    const need = distinct.map((w) => combo.filter((o) => o.word === w).length);
    const distinctLists = distinct.map((w) => index.positions(w, docIndex));
    if (distinctLists.some((l, k) => l.length < need[k])) return;
    const o = orderedWindow(combo.map((c) => index.positions(c.word, docIndex)));
    const w = o && o.span <= maxSpan ? o : anyOrderWindow(distinctLists, need);
    /* istanbul ignore next -- every word occurs often enough (checked above) */
    if (!w) return;
    const cost = combo.reduce((sum, c) => sum + c.cost, 0);
    const rank = combo.reduce((sum, c, i) => sum + plan.slots[i].options.indexOf(c), 0);
    const weightedIdf = combo.reduce(
      (sum, c) => sum + (index.vocabulary.get(c.word)?.idf ?? 0) * c.quality,
      0,
    );
    const score = (stage: TextStage) =>
      scoreMatch({
        stage,
        idfSum: weightedIdf,
        queryLength: n,
        docLength,
        span: w.span,
        coverage: 1,
      });
    const s = score('corrected');
    const better =
      !best ||
      cost < best.cost ||
      (cost === best.cost && (rank < best.rank || (rank === best.rank && s > bestScore)));
    if (better) {
      best = {
        chosen: [...combo],
        cost,
        rank,
        words: [...new Set(w.words)].sort((a, b) => a - b),
        score,
      };
      bestScore = s;
    }
  };
  const visit = (i: number) => {
    if (tried >= MAX_READINGS) return;
    if (i === n) {
      tried++;
      evaluate();
      return;
    }
    for (const o of present[i]) {
      combo.push(o);
      visit(i + 1);
      combo.pop();
    }
  };
  visit(0);
  return best;
}

/** The `corrected` block for the words one result actually used. */
function describeCorrection(plan: CorrectionPlan, chosen: readonly SlotOption[]): CorrectedInfo {
  const changes: CorrectedInfo['changes'] = [];
  for (let i = 0; i < plan.slots.length; i++) {
    const slot = plan.slots[i];
    if (slot.splitGroup !== undefined) {
      let j = i;
      while (j + 1 < plan.slots.length && plan.slots[j + 1].splitGroup === slot.splitGroup) j++;
      const to = chosen.slice(i, j + 1).map((c) => c.word);
      changes.push({ from: slot.original, to: to.join(' '), kind: 'split' });
      i = j;
    } else if (chosen[i].kind !== 'exact') {
      changes.push({
        from: slot.original,
        to: chosen[i].word,
        kind: chosen[i].kind as CorrectionKind,
      });
    }
  }
  return { applied: true, text: chosen.map((c) => c.word).join(' '), changes };
}

/**
 * Search orchestration (claude.md 5.6):
 *   stage 0  reference  "2:255", "البقرة 255", "سورة الكهف"     -> that ayah, first
 *   stage 1  phrase     contiguous normalized phrase
 *   stage 2  ordered    every word, in order, inside a small window
 *   stage 3  all_terms  every word, any order
 *   stage 4  corrected  stages 1-3 again after correcting OOV words (phonetic/edit/merge/split)
 *   stage 6  loose      the same, when a skeleton correction was needed (last resort)
 * Corrections run only when stages 0-3 found nothing and some query word is not in the
 * vocabulary (claude.md 5.1: a vocabulary word is never changed). When every word is in the
 * vocabulary and nothing matched, "هل تقصد" suggestions are returned instead (never applied).
 * Stages always keep their order; inside a stage hits are ranked by the 5.6 score, ties in
 * mushaf order. After each stage, if MIN_RESULTS hits are gathered, weaker stages are skipped.
 * A reference never replaces text results (a bare sura name that is also Quran text gets the
 * reference first, then the text matches).
 */
@Injectable()
export class SearchService {
  private readonly cache = new LruCache<Ranked>(CACHE_MAX_ENTRIES, CACHE_TTL_MS);
  /** The snapshot the cache was filled from: a reindex swaps it and empties the cache. */
  private cachedFor: SearchSnapshot | null = null;

  constructor(private readonly indexService: SearchIndexService) {}

  search(
    raw: string,
    { page = 1, limit = DEFAULT_SEARCH_LIMIT, type = 'text', alts = [] }: SearchOptions = {},
  ): SearchOutcome {
    const snapshot = this.snapshot();
    const tokens = tokenize(raw);
    const variants = type === 'voice' ? [raw, ...alts.slice(0, MAX_ALTS)] : [raw];
    const rankedList = variants.map((v) => this.ranked(snapshot, v, type));
    const { ranked, from } =
      rankedList.length === 1 ? { ranked: rankedList[0], from: 0 } : mergeVariants(rankedList);
    const { hits, reference, corrected, didYouMean } = ranked;
    const start = (page - 1) * limit;
    const voiceInfo =
      type === 'voice'
        ? {
            alternatives: variants.slice(1).map((v) => tokenize(v).join(' ')),
            selected: tokenize(variants[from]).join(' '),
          }
        : {};
    return {
      query: { raw, normalized: tokens.join(' '), ...voiceInfo },
      corrected,
      didYouMean,
      reference,
      total: hits.length,
      page,
      limit,
      totalPages: Math.ceil(hits.length / limit),
      results: hits.slice(start, start + limit).map((h) => this.item(snapshot, h)),
    };
  }

  /**
   * claude.md 5.11 /search/suggest: completes or corrects the LAST word from the vocabulary
   * (exact word, then prefix by frequency, then fuzzy), without running the ranking.
   */
  suggest(raw: string): SuggestOutcome {
    const vocab = this.snapshot().index.vocabulary;
    const tokens = tokenize(raw);
    const query = { raw, normalized: tokens.join(' ') };
    const last = tokens.at(-1);
    if (last === undefined) return { query, suggestions: [] };

    // Prefix matches (the word itself included) by frequency; then fuzzy for an OOV word.
    const picked = new Map<string, Suggestion['kind']>();
    for (const w of vocab.withPrefix(last, SUGGEST_LIMIT)) {
      picked.set(w, w === last ? 'exact' : 'prefix');
    }
    if (picked.size < SUGGEST_LIMIT && !vocab.has(last)) {
      for (const c of wordCandidates(vocab, last)) {
        if (!picked.has(c.candidate)) picked.set(c.candidate, c.kind);
      }
    }
    const head = tokens.slice(0, -1);
    return {
      query,
      suggestions: [...picked]
        .slice(0, SUGGEST_LIMIT)
        .map(([word, kind]) => ({ text: [...head, word].join(' '), word, kind })),
    };
  }

  /** One transcript ranked, through the cache. */
  private ranked(snapshot: SearchSnapshot, raw: string, type: SearchType): Ranked {
    const tokens = tokenize(raw);
    const parsed = parseReference(raw, snapshot.suras);
    // claude.md 5.11 keys the cache on normalizedQuery+type. The reference parse is part of
    // the key because it reads the RAW query ("2:255" and "2 255" normalize alike).
    const key = [type, tokens.join(' '), JSON.stringify(parsed)].join('\u0001');
    let ranked = this.cache.get(key);
    if (!ranked) {
      ranked = this.rank(snapshot, parsed, tokens, type);
      if (ranked.hits.length <= CACHE_MAX_HITS) this.cache.set(key, ranked);
    }
    return ranked;
  }

  /** Cache size and hit/miss counters (diagnostics and tests). */
  cacheStats(): { size: number; hits: number; misses: number } {
    return this.cache.stats();
  }

  private snapshot(): SearchSnapshot {
    const snapshot = this.indexService.currentSnapshot();
    // claude.md 5.11: no search before the index is ready (mapped to HTTP 503).
    if (!snapshot) throw new ServiceUnavailableException('Search index is not ready yet');
    if (snapshot !== this.cachedFor) {
      this.cache.clear(); // results of the previous index must never be served
      this.cachedFor = snapshot;
    }
    return snapshot;
  }

  private rank(
    snapshot: SearchSnapshot,
    parsed: ReferenceParse,
    tokens: string[],
    type: SearchType,
  ): Ranked {
    const { index } = snapshot;
    const result: Ranked = { hits: [], reference: null, corrected: null, didYouMean: null };
    const hits = result.hits;
    const seen = new Set<number>();
    const add = (group: Hit[], sorted = false) => {
      if (!sorted) group.sort(byScore);
      for (const h of group) {
        hits.push(h);
        seen.add(h.docIndex);
      }
    };

    const distinct = [...new Set(tokens)];
    const idfSum = distinct.reduce((s, t) => s + (index.vocabulary.get(t)?.idf ?? 0), 0);

    // Stage 0: reference.
    const phraseMatches = index.findPhrase(tokens);
    let refHit: Hit | null = null;
    if (parsed.status === 'ok') {
      const { ref } = parsed;
      const ambiguous = ref.kind === 'sura' && !ref.explicit && phraseMatches.length > 0;
      result.reference = { ...parsed, ambiguous };
      const docIndex = index.docIndexOf(ref.sura, ref.kind === 'ayah' ? ref.ayah : 1);
      // SuraCatalog.build() guarantees every in-range reference is indexed.
      if (docIndex !== undefined) {
        refHit = {
          docIndex,
          matchType: 'reference',
          score: referenceScore(idfSum),
          confidence: ambiguous ? 'medium' : 'high',
          words: [],
        };
        add([refHit]);
      }
    } else if (parsed.status === 'invalid') {
      result.reference = { ...parsed, ambiguous: false };
    }
    if (tokens.length === 0) return result;

    const score = (stage: TextStage, docIndex: number, span: number) =>
      scoreMatch({
        stage,
        idfSum,
        queryLength: tokens.length,
        docLength: index.doc(docIndex).length,
        span,
        coverage: 1,
      });

    // Stage 1: phrase.
    const phrase: Hit[] = [];
    for (const m of phraseMatches) {
      // Overlapping occurrences ("كلا كلا" inside "كلا كلا كلا") share words: dedupe.
      const words = [...new Set(m.starts.flatMap((s) => tokens.map((_, k) => s + k)))];
      if (refHit && m.docIndex === refHit.docIndex) {
        refHit.words = words; // the referenced ayah also matched as text: highlight it
        continue;
      }
      phrase.push({
        docIndex: m.docIndex,
        matchType: 'phrase',
        score: score('phrase', m.docIndex, tokens.length),
        confidence: 'high',
        words,
      });
    }
    add(phrase);
    if (hits.length >= MIN_RESULTS) return result;

    // Stages 2-3 share the candidates: docs holding every query word. For a single word they
    // would only find the phrase matches again.
    const ordered: Hit[] = [];
    const allTerms: Hit[] = [];
    const maxSpan = ORDERED_WINDOW_FACTOR * tokens.length;
    const need = distinct.map((t) => tokens.filter((x) => x === t).length);
    const candidates = tokens.length < 2 ? [] : index.docsWithAll(tokens);
    for (const docIndex of candidates) {
      if (seen.has(docIndex)) continue;
      const o = orderedWindow(tokens.map((t) => index.positions(t, docIndex)));
      if (o && o.span <= maxSpan) {
        ordered.push({
          docIndex,
          matchType: 'ordered',
          score: score('ordered', docIndex, o.span),
          confidence: 'high',
          words: o.words,
        });
        continue;
      }
      const w = anyOrderWindow(
        distinct.map((t) => index.positions(t, docIndex)),
        need,
      );
      /* istanbul ignore next -- docsWithAll() guarantees every word (with multiplicity) */
      if (!w) continue;
      allTerms.push({
        docIndex,
        matchType: 'all_terms',
        score: score('all_terms', docIndex, w.span),
        confidence: 'medium',
        words: w.words,
      });
    }
    add(ordered);
    if (hits.length >= MIN_RESULTS) return result;
    add(allTerms);

    // Stages 4-6 only when nothing matched and the query is not a reference (claude.md 5.1).
    if (hits.length > 0 || parsed.status !== 'none') return result;
    const vocab = index.vocabulary;
    const voice = type === 'voice';
    const hasOov = tokens.some((t) => !vocab.has(t));
    let plan: CorrectionPlan | null = null;
    let loose: Hit[] = [];
    if (hasOov || voice) {
      plan = planCorrection(vocab, tokens, { voice });
      let stage = plan.changed ? this.correctedStage(snapshot, plan) : NO_CORRECTION;
      if (!stage.corrected) {
        // 5.5 step 6 fallback: read glued words as split ("بسمالله" -> "بسم الله") even when
        // some unrelated single-word candidate exists.
        const split = planCorrection(vocab, tokens, { preferSplit: true, voice });
        if (split.splits > 0) {
          const splitStage = this.correctedStage(snapshot, split);
          if (splitStage.corrected) [stage, plan] = [splitStage, split];
        }
      }
      add(stage.groups[0], true); // stage 4, already in correction-cost order
      loose = stage.groups[1];
      result.corrected = stage.corrected;
    }
    if (!result.corrected && !hasOov) result.didYouMean = this.didYouMean(snapshot, tokens);

    // Stage 5: incomplete recitation / extra words (5.6, 5.10). Stage 6 (loose) comes after.
    if (hits.length < MIN_RESULTS) {
      add(partialStage(snapshot, plan ?? exactPlan(tokens), seen), true);
    }
    if (hits.length < MIN_RESULTS) add(loose, true);
    return result;
  }

  /**
   * Stages 4 / 6: docs holding one acceptable word for every slot of the corrected query.
   * Each doc uses, per slot, its best-quality word; skeleton-only matches are `loose`.
   */
  private correctedStage(
    snapshot: SearchSnapshot,
    plan: CorrectionPlan,
  ): { groups: Hit[][]; corrected: CorrectedInfo | null } {
    const { index } = snapshot;
    if (plan.slots.some((s) => s.options.length === 0))
      return { groups: [[], []], corrected: null };
    const corrected: Hit[] = [];
    const loose: Hit[] = [];
    const best = new Map<number, Reading>();
    const slotWords = plan.slots.map((s) => s.options.map((o) => o.word));

    for (const docIndex of index.docsMatchingSlots(slotWords)) {
      const reading = bestReading(snapshot, plan, docIndex);
      if (!reading) continue; // e.g. two slots need the same word but the ayah has it once
      const stage = reading.chosen.some((c) => c.kind === 'skeleton') ? 'loose' : 'corrected';
      best.set(docIndex, reading);
      (stage === 'loose' ? loose : corrected).push({
        docIndex,
        matchType: stage,
        score: reading.score(stage),
        // claude.md 5.7: medium after a light correction, low for loose matches.
        confidence: stage === 'loose' ? 'low' : 'medium',
        words: reading.words,
      });
    }
    // claude.md 5.5 orders candidates by cost, then frequency, then length: results follow the
    // same order (then the 5.6 score, then mushaf order), so a rare word reached by an equally
    // costly edit cannot outrank the likelier one.
    const byCost = (a: Hit, b: Hit) => {
      const ra = best.get(a.docIndex)!;
      const rb = best.get(b.docIndex)!;
      return ra.cost - rb.cost || ra.rank - rb.rank || byScore(a, b);
    };
    corrected.sort(byCost);
    loose.sort(byCost);
    const top = corrected[0] ?? loose[0];
    if (!top) return { groups: [[], []], corrected: null };
    return {
      groups: [corrected, loose],
      corrected: describeCorrection(plan, best.get(top.docIndex)!.chosen),
    };
  }

  /**
   * "هل تقصد" (claude.md 5.1): every word is in the vocabulary but nothing matched. Offers
   * queries with ONE word swapped for a close vocabulary word, only those that find ayahs.
   */
  private didYouMean(snapshot: SearchSnapshot, tokens: string[]): string[] | null {
    const { index } = snapshot;
    const found = new Map<string, { cost: number; count: number }>();
    tokens.forEach((t, i) => {
      for (const c of neighbours(index.vocabulary, t)) {
        const alt = [...tokens];
        alt[i] = c.candidate;
        const text = alt.join(' ');
        if (found.has(text)) continue;
        const count = index.docsWithAll(alt).length;
        if (count > 0) found.set(text, { cost: c.cost, count });
      }
    });
    const list = [...found]
      .sort(([, a], [, b]) => a.cost - b.cost || b.count - a.count)
      .slice(0, DID_YOU_MEAN_LIMIT)
      .map(([text]) => text);
    return list.length ? list : null;
  }

  private item(snapshot: SearchSnapshot, h: Hit): SearchResultItem {
    const d = snapshot.index.doc(h.docIndex);
    return {
      ayahId: d.ayahId,
      suraNumber: d.suraNumber,
      suraName: snapshot.suras.get(d.suraNumber)?.nameAr ?? '',
      ayahNumber: d.ayahNumber,
      ref: d.ref,
      textUthmani: snapshot.uthmani[h.docIndex],
      matchType: h.matchType,
      score: h.score,
      confidence: h.confidence,
      matchedWords: h.words,
      highlights: h.words.length ? snapshot.alignment.rangesFor(h.docIndex, h.words) : [],
    };
  }
}
