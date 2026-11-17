import { InvertedIndex } from '../index/inverted-index';
import { createIndexPhraseSearch } from './index-phrase-search';
import { createPhraseBaseline } from './phrase-baseline';

const corpus = [
  { ayahId: 1, suraNumber: 94, ayahNumber: 5, textSimple: 'فإن مع العسر يسرا' },
  { ayahId: 2, suraNumber: 94, ayahNumber: 6, textSimple: 'إن مع العسر يسرا' },
  { ayahId: 3, suraNumber: 112, ayahNumber: 1, textSimple: 'قل هو الله أحد' },
];

describe('createIndexPhraseSearch', () => {
  const indexed = createIndexPhraseSearch(InvertedIndex.build(corpus));
  const baseline = createPhraseBaseline(
    corpus.map((d) => ({ ref: `${d.suraNumber}:${d.ayahNumber}`, textSimple: d.textSimple })),
  );

  it.each(['مع العسر', 'إِنَّ مَعَ', 'قل هو الله احد', 'غير', '2:255', ''])(
    'returns exactly what the baseline returns for %p',
    async (q) => {
      await expect(indexed(q, 'text')).resolves.toEqual(await baseline(q, 'text'));
    },
  );

  it('returns refs with high confidence in corpus order', async () => {
    await expect(indexed('مع العسر يسرا', 'text')).resolves.toEqual([
      { ref: '94:5', confidence: 'high' },
      { ref: '94:6', confidence: 'high' },
    ]);
  });
});
