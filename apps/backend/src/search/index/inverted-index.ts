import { tokenize } from './tokenize';
import { computeIdf, Vocabulary, type VocabEntry } from './vocabulary';

/** One ayah as loaded from the DB (only the columns search needs). */
export interface CorpusDoc {
  ayahId: number;
  suraNumber: number;
  ayahNumber: number;
  textSimple: string;
}

export interface IndexedDoc {
  ayahId: number;
  suraNumber: number;
  ayahNumber: number;
  /** "sura:ayah" */
  ref: string;
  /** Number of normalized tokens. */
  length: number;
}

export interface PhraseMatch {
  docIndex: number;
  /** Token positions where the phrase starts (ascending). */
  starts: number[];
}

export interface IndexStats {
  docs: number;
  terms: number;
  tokens: number;
  postings: number;
  avgDocLength: number;
  maxDocLength: number;
}

/**
 * Postings of one term, packed into typed arrays:
 *   docs[i]                       = i-th doc index containing the term (ascending)
 *   positions[posStart[i] .. posStart[i+1])  = its token positions in that doc (ascending)
 */
interface TermPostings {
  docs: Uint32Array;
  posStart: Uint32Array;
  positions: Uint16Array;
}

const EMPTY_DOCS = new Uint32Array(0);
const EMPTY_POSITIONS = new Uint16Array(0);
const MAX_DOC_LENGTH = 0xffff; // positions are Uint16

/** Index of `value` in a sorted array, or -1. */
function binarySearch(sorted: Uint32Array, value: number): number {
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const v = sorted[mid];
    if (v === value) return mid;
    if (v < value) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

/**
 * Immutable in-memory inverted index over normalized ayah text (claude.md 5.4).
 * Built once at startup; a rebuild creates a new instance and swaps it in.
 */
export class InvertedIndex {
  private constructor(
    private readonly docList: readonly IndexedDoc[],
    private readonly docTerms: readonly Uint32Array[],
    private readonly terms: readonly string[],
    private readonly termIds: ReadonlyMap<string, number>,
    private readonly postingList: readonly TermPostings[],
    readonly vocabulary: Vocabulary,
    private readonly tokenTotal: number,
    private readonly refToDoc: ReadonlyMap<string, number>,
  ) {}

  static build(corpus: readonly CorpusDoc[]): InvertedIndex {
    const termIds = new Map<string, number>();
    const terms: string[] = [];
    // Per term, flattened [doc, pos, doc, pos, ...] in doc order then position order.
    const occurrences: number[][] = [];
    const docs: IndexedDoc[] = [];
    const docTerms: Uint32Array[] = [];
    const refToDoc = new Map<string, number>();
    let tokenTotal = 0;

    corpus.forEach((d, docIndex) => {
      const tokens = tokenize(d.textSimple);
      if (tokens.length > MAX_DOC_LENGTH) {
        throw new RangeError(
          `ayah ${d.ayahId} has ${tokens.length} tokens (max ${MAX_DOC_LENGTH})`,
        );
      }
      const ids = new Uint32Array(tokens.length);
      tokens.forEach((token, pos) => {
        let id = termIds.get(token);
        if (id === undefined) {
          id = terms.length;
          termIds.set(token, id);
          terms.push(token);
          occurrences.push([]);
        }
        ids[pos] = id;
        occurrences[id].push(docIndex, pos);
      });
      tokenTotal += tokens.length;
      docTerms.push(ids);
      const ref = `${d.suraNumber}:${d.ayahNumber}`;
      if (refToDoc.has(ref)) throw new RangeError(`duplicate ayah reference ${ref}`);
      refToDoc.set(ref, docIndex);
      docs.push({
        ayahId: d.ayahId,
        suraNumber: d.suraNumber,
        ayahNumber: d.ayahNumber,
        ref,
        length: tokens.length,
      });
    });

    const postings: TermPostings[] = [];
    const vocab: VocabEntry[] = [];
    occurrences.forEach((occ, termId) => {
      const cf = occ.length / 2;
      let df = 0;
      for (let i = 0; i < occ.length; i += 2) if (i === 0 || occ[i] !== occ[i - 2]) df++;

      const docIdx = new Uint32Array(df);
      const posStart = new Uint32Array(df + 1);
      const positions = new Uint16Array(cf);
      let d = -1;
      for (let i = 0, p = 0; i < occ.length; i += 2, p++) {
        if (i === 0 || occ[i] !== occ[i - 2]) {
          d++;
          docIdx[d] = occ[i];
          posStart[d] = p;
        }
        positions[p] = occ[i + 1];
      }
      posStart[df] = cf;
      postings.push({ docs: docIdx, posStart, positions });
      vocab.push({
        word: terms[termId],
        termId,
        df,
        cf,
        idf: computeIdf(docs.length, df),
      });
    });

    return new InvertedIndex(
      docs,
      docTerms,
      terms,
      termIds,
      postings,
      new Vocabulary(vocab),
      tokenTotal,
      refToDoc,
    );
  }

  get docCount(): number {
    return this.docList.length;
  }

  get termCount(): number {
    return this.terms.length;
  }

  doc(docIndex: number): IndexedDoc {
    const d = this.docList[docIndex];
    if (!d) throw new RangeError(`no doc ${docIndex}`);
    return d;
  }

  /** Doc index of sura:ayah, or undefined when that ayah is not indexed. */
  docIndexOf(sura: number, ayah: number): number | undefined {
    return this.refToDoc.get(`${sura}:${ayah}`);
  }

  /** sura -> number of indexed ayahs (cross-checked against the suras table). */
  ayahCountsBySura(): Map<number, number> {
    const counts = new Map<number, number>();
    for (const d of this.docList) counts.set(d.suraNumber, (counts.get(d.suraNumber) ?? 0) + 1);
    return counts;
  }

  /** Normalized tokens of a doc, in order. */
  docTokens(docIndex: number): string[] {
    this.doc(docIndex);
    return Array.from(this.docTerms[docIndex], (id) => this.terms[id]);
  }

  termId(word: string): number | undefined {
    return this.termIds.get(word);
  }

  /** Ascending doc indexes containing the (normalized) word. */
  postings(word: string): Uint32Array {
    const id = this.termIds.get(word);
    return id === undefined ? EMPTY_DOCS : this.postingList[id].docs;
  }

  /** Ascending token positions of the word in a doc (empty when absent). */
  positions(word: string, docIndex: number): Uint16Array {
    const id = this.termIds.get(word);
    return id === undefined ? EMPTY_POSITIONS : this.positionsById(id, docIndex);
  }

  private positionsById(termId: number, docIndex: number): Uint16Array {
    const p = this.postingList[termId];
    const i = binarySearch(p.docs, docIndex);
    return i === -1 ? EMPTY_POSITIONS : p.positions.subarray(p.posStart[i], p.posStart[i + 1]);
  }

  /**
   * Docs containing the normalized tokens as a contiguous phrase, in corpus (mushaf) order.
   * Walks the rarest term's postings and verifies the others by position.
   */
  findPhrase(tokens: readonly string[]): PhraseMatch[] {
    if (tokens.length === 0) return [];
    const ids: number[] = [];
    for (const t of tokens) {
      const id = this.termIds.get(t);
      if (id === undefined) return [];
      ids.push(id);
    }
    let pivot = 0;
    ids.forEach((id, i) => {
      if (this.postingList[id].docs.length < this.postingList[ids[pivot]].docs.length) pivot = i;
    });

    const matches: PhraseMatch[] = [];
    for (const docIndex of this.postingList[ids[pivot]].docs) {
      const lists = ids.map((id) => this.positionsById(id, docIndex));
      if (lists.some((l) => l.length === 0)) continue;
      const starts: number[] = [];
      for (const start of lists[0]) {
        let ok = true;
        for (let k = 1; k < lists.length && ok; k++) ok = lists[k].includes(start + k);
        if (ok) starts.push(start);
      }
      if (starts.length) matches.push({ docIndex, starts });
    }
    return matches;
  }

  /**
   * Docs containing every normalized token, each at least as many times as it appears in
   * `tokens` (so "كلا كلا" needs two). Ascending doc order. Walks the rarest term's postings.
   */
  docsWithAll(tokens: readonly string[]): number[] {
    if (tokens.length === 0) return [];
    const need = new Map<number, number>();
    for (const t of tokens) {
      const id = this.termIds.get(t);
      if (id === undefined) return [];
      need.set(id, (need.get(id) ?? 0) + 1);
    }
    const ids = [...need.keys()].sort(
      (a, b) => this.postingList[a].docs.length - this.postingList[b].docs.length,
    );
    const out: number[] = [];
    for (const docIndex of this.postingList[ids[0]].docs) {
      if (ids.every((id) => this.positionsById(id, docIndex).length >= need.get(id)!)) {
        out.push(docIndex);
      }
    }
    return out;
  }

  /**
   * Corrected search (claude.md 5.6 stage 4): docs containing, for EVERY slot, at least one
   * of that slot's words. Ascending doc order. Unknown words are ignored; a slot with no
   * known word matches nothing.
   */
  docsMatchingSlots(slots: readonly (readonly string[])[]): number[] {
    if (slots.length === 0) return [];
    const unions: Set<number>[] = [];
    for (const words of slots) {
      const docs = new Set<number>();
      for (const w of words) for (const d of this.postings(w)) docs.add(d);
      if (docs.size === 0) return [];
      unions.push(docs);
    }
    unions.sort((a, b) => a.size - b.size);
    const out: number[] = [];
    for (const d of unions[0]) if (unions.every((u) => u.has(d))) out.push(d);
    return out.sort((a, b) => a - b);
  }

  /** findPhrase() for raw user text (normalized with the shared normalize()). */
  findPhraseText(query: string): PhraseMatch[] {
    return this.findPhrase(tokenize(query));
  }

  stats(): IndexStats {
    return {
      docs: this.docList.length,
      terms: this.terms.length,
      tokens: this.tokenTotal,
      postings: this.postingList.reduce((n, p) => n + p.docs.length, 0),
      avgDocLength: this.docList.length ? this.tokenTotal / this.docList.length : 0,
      maxDocLength: this.docList.reduce((m, d) => Math.max(m, d.length), 0),
    };
  }
}
