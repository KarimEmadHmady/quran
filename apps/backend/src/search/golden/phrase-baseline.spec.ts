import { containsPhrase, createPhraseBaseline } from './phrase-baseline';

describe('containsPhrase', () => {
  it('matches whole contiguous words only', () => {
    expect(containsPhrase('قل هو الله احد', 'هو الله')).toBe(true);
    expect(containsPhrase('قل هو الله احد', 'قل هو الله احد')).toBe(true);
    expect(containsPhrase('فان مع العسر يسرا', 'ان مع العسر')).toBe(false); // prefix fa
    expect(containsPhrase('قل هو الله احد', 'الله هو')).toBe(false); // order matters
    expect(containsPhrase('قل هو الله احد', '')).toBe(false);
  });
});

describe('createPhraseBaseline', () => {
  const search = createPhraseBaseline([
    { ref: '94:5', textSimple: 'فإن مع العسر يسرا' },
    { ref: '94:6', textSimple: 'إن مع العسر يسرا' },
    { ref: '112:1', textSimple: 'قل هو الله أحد' },
  ]);

  it('normalizes both sides and returns hits in corpus order', async () => {
    await expect(search('إِنَّ مَعَ ٱلْعُسْرِ', 'text')).resolves.toEqual([
      { ref: '94:6', confidence: 'high' },
    ]);
    await expect(search('مع العسر', 'text')).resolves.toEqual([
      { ref: '94:5', confidence: 'high' },
      { ref: '94:6', confidence: 'high' },
    ]);
    await expect(search('قل هو الله احد', 'text')).resolves.toHaveLength(1);
  });

  it('returns nothing for references, non-Quran text and empty queries', async () => {
    await expect(search('2:255', 'text')).resolves.toEqual([]);
    await expect(search('hello', 'text')).resolves.toEqual([]);
    await expect(search('   ', 'text')).resolves.toEqual([]);
  });
});
