import { phonetic, skeleton } from '../text/phonetic';

export interface VocabEntry {
  /** Normalized word (claude.md 5.2). */
  word: string;
  termId: number;
  /** Document frequency: number of ayahs containing the word. */
  df: number;
  /** Collection frequency: total occurrences across all ayahs. */
  cf: number;
  /** Inverse document frequency (see computeIdf). */
  idf: number;
}

/**
 * BM25 IDF: ln(1 + (N - df + 0.5) / (df + 0.5)). Always > 0, so very common words such as
 * "الله" or "من" still count a little (claude.md 5.6: stopwords are never removed, IDF ranks).
 */
export function computeIdf(docCount: number, df: number): number {
  if (docCount <= 0 || df <= 0 || df > docCount) {
    throw new RangeError(`invalid idf input: docCount=${docCount}, df=${df}`);
  }
  return Math.log(1 + (docCount - df + 0.5) / (df + 0.5));
}

/** Padded character trigrams ("^ab", "abc", ..., "yz$") used to find correction candidates. */
export function trigrams(word: string): string[] {
  const padded = `^${word}$`;
  const out = new Set<string>();
  for (let i = 0; i + 3 <= padded.length; i++) out.add(padded.slice(i, i + 3));
  return [...out];
}

const EMPTY: readonly string[] = [];

/**
 * Read-only word statistics for the corpus, plus the lookups the token corrector needs
 * (claude.md 5.4): byPhonetic, bySkeleton, trigrams, and a sorted list for prefix search.
 */
export class Vocabulary {
  private readonly byWord: ReadonlyMap<string, VocabEntry>;
  private readonly phoneticIndex = new Map<string, string[]>();
  private readonly skeletonIndex = new Map<string, string[]>();
  private readonly trigramIndex = new Map<string, string[]>();
  private readonly sorted: readonly string[];

  constructor(private readonly list: readonly VocabEntry[]) {
    this.byWord = new Map(list.map((e) => [e.word, e]));
    const push = (m: Map<string, string[]>, key: string, word: string) => {
      const l = m.get(key);
      if (l) l.push(word);
      else m.set(key, [word]);
    };
    for (const { word } of list) {
      push(this.phoneticIndex, phonetic(word), word);
      push(this.skeletonIndex, skeleton(word), word);
      for (const t of trigrams(word)) push(this.trigramIndex, t, word);
    }
    this.sorted = list.map((e) => e.word).sort();
  }

  get size(): number {
    return this.list.length;
  }

  has(word: string): boolean {
    return this.byWord.has(word);
  }

  get(word: string): VocabEntry | undefined {
    return this.byWord.get(word);
  }

  /** Entries in term-id order. */
  entries(): readonly VocabEntry[] {
    return this.list;
  }

  /** Words whose phonetic() key equals `key`. */
  byPhonetic(key: string): readonly string[] {
    return this.phoneticIndex.get(key) ?? EMPTY;
  }

  /** Words whose skeleton() key equals `key`. */
  bySkeleton(key: string): readonly string[] {
    return this.skeletonIndex.get(key) ?? EMPTY;
  }

  /** Words sharing at least one padded trigram with `word` (edit-distance candidates). */
  trigramNeighbours(word: string): Set<string> {
    const out = new Set<string>();
    for (const t of trigrams(word)) for (const w of this.trigramIndex.get(t) ?? EMPTY) out.add(w);
    return out;
  }

  /** Words starting with `prefix`, most frequent first (ties alphabetical). */
  withPrefix(prefix: string, limit: number): string[] {
    if (prefix === '' || limit <= 0) return [];
    let lo = 0;
    let hi = this.sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.sorted[mid] < prefix) lo = mid + 1;
      else hi = mid;
    }
    const matches: string[] = [];
    for (let i = lo; i < this.sorted.length && this.sorted[i].startsWith(prefix); i++) {
      matches.push(this.sorted[i]);
    }
    return matches
      .sort((a, b) => this.byWord.get(b)!.df - this.byWord.get(a)!.df || (a < b ? -1 : 1))
      .slice(0, limit);
  }
}
