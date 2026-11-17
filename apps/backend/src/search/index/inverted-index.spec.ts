import { InvertedIndex, type CorpusDoc } from './inverted-index';
import { tokenize } from './tokenize';
import { computeIdf } from './vocabulary';

const doc = (ayahId: number, sura: number, ayah: number, textSimple: string): CorpusDoc => ({
  ayahId,
  suraNumber: sura,
  ayahNumber: ayah,
  textSimple,
});

// Small corpus with known postings. Written with hamza/teh marbuta to exercise normalize().
const CORPUS: CorpusDoc[] = [
  doc(1, 1, 1, 'بسم الله الرحمن الرحيم'),
  doc(2, 1, 2, 'الحمد لله رب العالمين'),
  doc(3, 94, 5, 'فإن مع العسر يسرا'),
  doc(4, 94, 6, 'إن مع العسر يسرا'),
  doc(5, 112, 1, 'قل هو الله أحد'),
  doc(6, 112, 2, 'الله الصمد'),
  doc(7, 9, 9, 'الله الله الله إن الله'), // repeated term: several positions in one doc
  doc(8, 9, 10, ''), // empty text: indexed with length 0
];

describe('tokenize', () => {
  it('normalizes and splits on single spaces', () => {
    expect(tokenize('إِنَّ مَعَ ٱلْعُسْرِ')).toEqual(['ان', 'مع', 'العسر']);
    expect(tokenize('  رحمة   ')).toEqual(['رحمه']);
  });

  it('returns no tokens for empty or non-Arabic input', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize('hello')).toEqual([]);
  });
});

describe('InvertedIndex.build', () => {
  const index = InvertedIndex.build(CORPUS);

  it('keeps docs in corpus order with refs and lengths', () => {
    expect(index.docCount).toBe(8);
    expect(index.doc(0)).toEqual({
      ayahId: 1,
      suraNumber: 1,
      ayahNumber: 1,
      ref: '1:1',
      length: 4,
    });
    expect(index.doc(7)).toMatchObject({ ref: '9:10', length: 0 });
    expect(() => index.doc(8)).toThrow(RangeError);
    expect(() => index.doc(-1)).toThrow(RangeError);
  });

  it('stores normalized tokens per doc', () => {
    expect(index.docTokens(3)).toEqual(['ان', 'مع', 'العسر', 'يسرا']);
    expect(index.docTokens(4)).toEqual(['قل', 'هو', 'الله', 'احد']);
    expect(index.docTokens(7)).toEqual([]);
  });

  it('postings are ascending doc indexes; unknown words have none', () => {
    expect(Array.from(index.postings('الله'))).toEqual([0, 4, 5, 6]);
    expect(Array.from(index.postings('مع'))).toEqual([2, 3]);
    expect(index.postings('غير')).toHaveLength(0);
    expect(index.termId('غير')).toBeUndefined();
    expect(index.termId('الله')).toBe(1);
  });

  it('stores every position of a word in a doc', () => {
    expect(Array.from(index.positions('الله', 6))).toEqual([0, 1, 2, 4]);
    expect(Array.from(index.positions('ان', 6))).toEqual([3]);
    expect(Array.from(index.positions('الله', 4))).toEqual([2]);
    expect(index.positions('الله', 1)).toHaveLength(0); // doc without the word
    expect(index.positions('غير', 0)).toHaveLength(0); // unknown word
  });

  it('builds the vocabulary with df, cf and BM25 idf', () => {
    const allah = index.vocabulary.get('الله');
    expect(allah).toEqual({ word: 'الله', termId: 1, df: 4, cf: 7, idf: computeIdf(8, 4) });
    const samad = index.vocabulary.get('الصمد');
    expect(samad).toMatchObject({ df: 1, cf: 1 });
    expect(samad!.idf).toBeGreaterThan(allah!.idf); // rare words weigh more
    expect(index.vocabulary.has('احد')).toBe(true); // stored normalized
    expect(index.vocabulary.has('أحد')).toBe(false);
    expect(index.vocabulary.size).toBe(index.termCount);
    expect(index.vocabulary.entries().map((e) => e.termId)).toEqual([
      ...Array(index.termCount).keys(),
    ]);
  });

  it('reports stats', () => {
    expect(index.stats()).toEqual({
      docs: 8,
      terms: index.termCount,
      tokens: 4 + 4 + 4 + 4 + 4 + 2 + 5 + 0,
      postings: index.vocabulary.entries().reduce((n, e) => n + e.df, 0),
      avgDocLength: 27 / 8,
      maxDocLength: 5,
    });
  });

  it('handles an empty corpus', () => {
    const empty = InvertedIndex.build([]);
    expect(empty.stats()).toEqual({
      docs: 0,
      terms: 0,
      tokens: 0,
      postings: 0,
      avgDocLength: 0,
      maxDocLength: 0,
    });
    expect(empty.findPhraseText('الله')).toEqual([]);
  });

  it('looks up doc indexes by sura:ayah (S4 references)', () => {
    expect(index.docIndexOf(1, 1)).toBe(0);
    expect(index.docIndexOf(112, 2)).toBe(5);
    expect(index.docIndexOf(9, 10)).toBe(7);
    expect(index.docIndexOf(2, 255)).toBeUndefined();
    expect(index.docIndexOf(0, 0)).toBeUndefined();
  });

  it('counts indexed ayahs per sura', () => {
    expect([...index.ayahCountsBySura()]).toEqual([
      [1, 2],
      [94, 2],
      [112, 2],
      [9, 2],
    ]);
  });

  it('docsWithAll(): docs holding every word, with multiplicity, in doc order', () => {
    expect(index.docsWithAll(['مع', 'العسر'])).toEqual([2, 3]);
    expect(index.docsWithAll(['العسر', 'مع'])).toEqual([2, 3]); // order-free
    expect(index.docsWithAll(['الله'])).toEqual([0, 4, 5, 6]);
    expect(index.docsWithAll(['الله', 'الله', 'الله', 'الله'])).toEqual([6]);
    expect(index.docsWithAll(['الله', 'غير'])).toEqual([]);
    expect(index.docsWithAll([])).toEqual([]);
  });

  it('docsMatchingSlots(): one word per slot, any of its alternatives (Phase 3)', () => {
    expect(index.docsMatchingSlots([['العسر'], ['فان', 'ان']])).toEqual([2, 3]);
    expect(index.docsMatchingSlots([['الصمد', 'احد'], ['الله']])).toEqual([4, 5]);
    expect(index.docsMatchingSlots([['غير', 'الله']])).toEqual([0, 4, 5, 6]);
    expect(index.docsMatchingSlots([['الله'], ['غير']])).toEqual([]);
    expect(index.docsMatchingSlots([])).toEqual([]);
  });

  it('rejects two docs with the same sura:ayah', () => {
    expect(() => InvertedIndex.build([doc(1, 1, 1, 'ا'), doc(2, 1, 1, 'ب')])).toThrow(
      'duplicate ayah reference 1:1',
    );
  });

  it('rejects a doc longer than the Uint16 position range', () => {
    const huge = doc(1, 1, 1, Array.from({ length: 70_000 }, () => 'ب').join(' '));
    expect(() => InvertedIndex.build([huge])).toThrow(/max 65535/);
  });
});

describe('InvertedIndex.findPhrase', () => {
  const index = InvertedIndex.build(CORPUS);
  const refs = (q: string) => index.findPhraseText(q).map((m) => index.doc(m.docIndex).ref);

  it('finds contiguous phrases in corpus order, normalizing the query', () => {
    expect(refs('مع العسر يسرا')).toEqual(['94:5', '94:6']);
    expect(refs('إِنَّ مَعَ ٱلْعُسْرِ')).toEqual(['94:6']); // "فان" is a different token
    expect(refs('قل هو الله احد')).toEqual(['112:1']);
    expect(refs('الحمد لله رب العالمين')).toEqual(['1:2']);
  });

  it('requires order and adjacency', () => {
    expect(refs('هو قل')).toEqual([]);
    expect(refs('قل الله')).toEqual([]);
  });

  it('returns every start position in a doc', () => {
    const [m] = index.findPhrase(['الله', 'الله']).filter((x) => x.docIndex === 6);
    expect(m.starts).toEqual([0, 1]);
    expect(index.findPhrase(['الله']).find((x) => x.docIndex === 6)?.starts).toEqual([0, 1, 2, 4]);
  });

  it('returns nothing for unknown words or empty queries', () => {
    expect(refs('الله غير')).toEqual([]);
    expect(index.findPhrase([])).toEqual([]);
    expect(refs('hello')).toEqual([]);
  });

  it('agrees with a brute-force scan on every sub-phrase of the corpus', () => {
    const texts = CORPUS.map((d) => tokenize(d.textSimple));
    for (const tokens of texts) {
      for (let i = 0; i < tokens.length; i++) {
        for (let j = i + 1; j <= tokens.length; j++) {
          const phrase = tokens.slice(i, j);
          const needle = ` ${phrase.join(' ')} `;
          const expected = texts
            .map((t, d) => (` ${t.join(' ')} `.includes(needle) ? d : -1))
            .filter((d) => d >= 0);
          expect(index.findPhrase(phrase).map((m) => m.docIndex)).toEqual(expected);
        }
      }
    }
  });
});
