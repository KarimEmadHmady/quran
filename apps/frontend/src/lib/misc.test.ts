import { afterEach, describe, expect, it, vi } from 'vitest';
import { clampQuery, search } from './api';
import { segments } from './highlight';
import { AyahIndex, BISMILLAH, ayahHref, showBismillahHeader } from './quran';
import { parseIntParam, parsePageParam } from './routeParams';
import { SHARE_CARD_WIDTH, SHARE_PIXEL_RATIO, shareFileName, shareFontSize } from './shareImage';
import { SURAS } from './testing/suras';

describe('AyahIndex (ids 1..6236 in mushaf order)', () => {
  const idx = new AyahIndex([...SURAS].reverse()); // input order does not matter

  it('covers the whole Quran', () => {
    expect(idx.total).toBe(6236);
    expect(idx.idOf(1, 1)).toBe(1);
    expect(idx.idOf(2, 255)).toBe(262);
    expect(idx.idOf(112, 1)).toBe(6222);
    expect(idx.idOf(114, 6)).toBe(6236);
  });

  it('maps every id back to its sura:ayah (round trip)', () => {
    for (let id = 1; id <= 6236; id++) {
      const r = idx.refOf(id)!;
      expect(idx.idOf(r.sura.number, r.ayahNumber)).toBe(id);
    }
  });

  it('rejects out-of-range values', () => {
    expect(idx.idOf(2, 287)).toBeNull();
    expect(idx.idOf(115, 1)).toBeNull();
    expect(idx.refOf(0)).toBeNull();
    expect(idx.refOf(6237)).toBeNull();
    expect(idx.refOf(1.5)).toBeNull();
  });

  it('builds ayah links', () => {
    expect(ayahHref(2, 262)).toBe('/surah/2#ayah-262');
  });
});

describe('basmala header', () => {
  it('not for Al-Fatiha, At-Tawba, or when ayah 1 already starts with it (97:1)', () => {
    expect(showBismillahHeader(1, BISMILLAH)).toBe(false);
    expect(showBismillahHeader(9, 'بَرَآءَةٌ')).toBe(false);
    expect(showBismillahHeader(97, `${BISMILLAH} إِنَّآ أَنزَلْنَٰهُ`)).toBe(false);
    // 97:1 as stored: an extra shadda on the ba, and a trailing space (real DB code points).
    const stored97 = String.fromCodePoint(0x628, 0x651, 0x650, 0x633, 0x652, 0x645, 0x650, 0x20) + BISMILLAH.slice(7);
    expect(showBismillahHeader(97, stored97)).toBe(false);
    expect(showBismillahHeader(2, 'الٓمٓ')).toBe(true);
    expect(showBismillahHeader(2, undefined)).toBe(true);
  });
});

describe('route params', () => {
  it('accepts plain in-range digits only', () => {
    expect(parseIntParam('2', 1, 114)).toBe(2);
    for (const bad of ['0', '115', '2.0', '-1', '1e2', ' 2', 'abc', '', undefined, ['2']]) {
      expect(parseIntParam(bad as string, 1, 114)).toBeNull();
    }
    expect(parsePageParam(undefined)).toBe(1);
    expect(parsePageParam('3')).toBe(3);
    expect(parsePageParam('0')).toBeNull();
  });
});

describe('share image', () => {
  it('long ayahs get smaller text; output is high resolution', () => {
    expect(shareFontSize('قُلْ هُوَ ٱللَّهُ أَحَدٌ')).toBe(64);
    expect(shareFontSize('ا'.repeat(300))).toBe(44);
    expect(shareFontSize('ا'.repeat(1200))).toBe(30);
    expect(SHARE_CARD_WIDTH * SHARE_PIXEL_RATIO).toBe(2160);
    expect(shareFileName(2, 255)).toBe('quran-2-255.png');
  });
});

describe('highlight segments', () => {
  it('splits text by ranges, clamping and merging overlaps', () => {
    expect(segments('abcdef', [{ start: 1, end: 3 }])).toEqual([
      { text: 'a', highlighted: false },
      { text: 'bc', highlighted: true },
      { text: 'def', highlighted: false },
    ]);
    expect(segments('abc', [{ start: 2, end: 9 }, { start: 1, end: 3 }])).toEqual([
      { text: 'a', highlighted: false },
      { text: 'bc', highlighted: true },
    ]);
    expect(segments('abc', [])).toEqual([{ text: 'abc', highlighted: false }]);
  });
});

describe('search client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('clamps queries to the API limits', () => {
    expect(clampQuery('  a  b ')).toBe('a b');
    expect(clampQuery(Array(25).fill('w').join(' ')).split(' ')).toHaveLength(20);
    expect(clampQuery('ا'.repeat(300))).toHaveLength(200);
  });

  it('sends type=voice with deduped, "|"-free alts; text searches carry no alts', async () => {
    const fetchMock = vi.fn((_url: URL) => Promise.resolve(new Response('{}', { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
    await search({ q: 'قل هو', type: 'voice', alts: ['قل هو', 'قل|هو الله', ' '] });
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get('type')).toBe('voice');
    expect(url.searchParams.get('alts')).toBe('قل هو الله');
    await search({ q: 'قل', alts: ['x'] });
    const url2 = new URL(String(fetchMock.mock.calls[1][0]));
    expect(url2.searchParams.has('alts')).toBe(false);
    expect(url2.searchParams.has('type')).toBe(false);
  });
});
