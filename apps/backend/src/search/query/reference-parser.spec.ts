import { SURAS_FIXTURE } from '../../../test/support/suras.fixture';
import {
  MAX_REFERENCE_INPUT,
  parseReference,
  toAsciiDigits,
  type ReferenceParse,
} from './reference-parser';
import { SuraCatalog } from './sura-catalog';

const catalog = SuraCatalog.build(SURAS_FIXTURE);
const parse = (q: string) => parseReference(q, catalog);
const ayah = (sura: number, a: number): ReferenceParse => ({
  status: 'ok',
  ref: { kind: 'ayah', sura, ayah: a },
});
const sura = (n: number, explicit: boolean): ReferenceParse => ({
  status: 'ok',
  ref: { kind: 'sura', sura: n, explicit },
});
const NONE: ReferenceParse = { status: 'none' };

describe('toAsciiDigits', () => {
  it('maps Arabic-Indic and Persian digits, leaves the rest', () => {
    expect(toAsciiDigits('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789');
    expect(toAsciiDigits('۰۱۲۳۴۵۶۷۸۹')).toBe('0123456789');
    expect(toAsciiDigits('البقرة 2')).toBe('البقرة 2');
  });
});

describe('parseReference: numeric sura:ayah', () => {
  it.each([
    ['2:255', 2, 255],
    ['٢:٢٥٥', 2, 255],
    ['۲:۲۵۵', 2, 255],
    ['2 : 255', 2, 255],
    ['  2:255  ', 2, 255],
    ['2/255', 2, 255],
    ['2：255', 2, 255], // fullwidth colon
    ['(2:255)', 2, 255],
    ['[2:255]', 2, 255],
    ['﴿٢:٢٥٥﴾', 2, 255],
    ['002:255', 2, 255],
    ['1:1', 1, 1],
    ['114:6', 114, 6],
    ['12:111', 12, 111], // repeated digits survive (normalize() would make 111 -> 11)
    ['2:٢٥٥', 2, 255], // mixed digit systems
  ])('%s -> %i:%i', (q, s, a) => {
    expect(parse(q)).toEqual(ayah(s, a));
  });

  it.each([
    ['2:287', 2, 287, 286],
    ['1:8', 1, 8, 7],
    ['2:0', 2, 0, 286],
    ['114:7', 114, 7, 6],
  ])('%s -> ayah_out_of_range', (q, s, a, count) => {
    expect(parse(q)).toEqual({
      status: 'invalid',
      reason: 'ayah_out_of_range',
      sura: s,
      ayah: a,
      ayahCount: count,
    });
  });

  it.each([
    ['115:1', 115],
    ['0:1', 0],
    ['999:1', 999],
  ])('%s -> sura_out_of_range', (q, s) => {
    expect(parse(q)).toEqual({ status: 'invalid', reason: 'sura_out_of_range', sura: s, ayah: 1 });
  });

  it.each([
    '255', // a bare number is ambiguous (sura? ayah? count?): not a reference
    '2 255', // two numbers without a separator
    '2:',
    ':255',
    '2:255:1',
    '2::255',
    '2:255-257', // ranges are not supported (dash is a soft separator -> 3 numbers)
    '12345:1', // too many digits
    '2:255 hello',
    'hello 2:255',
    '2:255 الله',
  ])('%s -> none', (q) => {
    expect(parse(q)).toEqual(NONE);
  });
});

describe('parseReference: sura name + ayah', () => {
  it.each([
    ['البقرة 255', 2, 255],
    ['البقره ٢٥٥', 2, 255],
    ['البقرة: 255', 2, 255],
    ['البقرة:255', 2, 255],
    ['[البقرة: 255]', 2, 255], // mushaf-style citation
    ['البقرة، 255', 2, 255],
    ['البقرة - 255', 2, 255],
    ['سورة البقرة 255', 2, 255],
    ['سوره البقره 255', 2, 255],
    ['سورةالبقرة 255', 2, 255], // no space after سورة
    ['سورة البقرة آية 255', 2, 255],
    ['سورة البقرة الآية 255', 2, 255],
    ['البقرة آية رقم 255', 2, 255],
    ['سُورَةُ البَقَرَةِ ٢٥٥', 2, 255], // diacritics
    ['الإخلاص 4', 112, 4],
    ['الاخلاص 4', 112, 4],
    ['سورة الملك 1', 67, 1],
    ['آل عمران 7', 3, 7],
    ['ال عمران 7', 3, 7],
    ['العمران 7', 3, 7],
    ['يوسف 111', 12, 111],
    ['الشورى 11', 42, 11],
    ['الشوري 11', 42, 11],
    ['الإسراء 1', 17, 1],
    ['الاسراء 1', 17, 1],
    ['سبأ 1', 34, 1],
    ['النبأ 1', 78, 1],
    ['الناس 6', 114, 6],
    ['الفاتحة ٧', 1, 7],
    ['ص 1', 38, 1],
    ['ق 1', 50, 1],
    ['يس ٨٣', 36, 83],
    ['طه 1', 20, 1],
  ])('%s -> %i:%i', (q, s, a) => {
    expect(parse(q)).toEqual(ayah(s, a));
  });

  it.each([
    ['بقرة 255', 2, 255], // without the article: the number is the signal
    ['كهف 10', 18, 10],
    ['سورة بقره 255', 2, 255],
    ['تبارك 1', 67, 1], // signal-only alias
    ['عم 1', 78, 1],
    ['براءة 1', 9, 1],
    ['بني إسرائيل 1', 17, 1],
    ['أم الكتاب 2', 1, 2],
    ['ياسين 1', 36, 1],
    ['حم السجدة 1', 41, 1],
  ])('signal-only / alias names with a number: %s -> %i:%i', (q, s, a) => {
    expect(parse(q)).toEqual(ayah(s, a));
  });

  it.each([
    ['البقرة 300', 2, 300, 286],
    ['البقرة 0', 2, 0, 286],
    ['الفاتحة 8', 1, 8, 7],
    ['الناس ٧', 114, 7, 6],
    ['يوسف 112', 12, 112, 111],
  ])('%s -> ayah_out_of_range', (q, s, a, count) => {
    expect(parse(q)).toEqual({
      status: 'invalid',
      reason: 'ayah_out_of_range',
      sura: s,
      ayah: a,
      ayahCount: count,
    });
  });
});

describe('parseReference: ayah first', () => {
  it.each([
    ['آية 255 من سورة البقرة', 2, 255],
    ['الآية ٢٥٥ من البقرة', 2, 255],
    ['الاية 255 البقرة', 2, 255],
    ['آية رقم 255 سورة البقرة', 2, 255],
    ['آية 255 بقرة', 2, 255],
  ])('%s -> %i:%i', (q, s, a) => {
    expect(parse(q)).toEqual(ayah(s, a));
  });

  it('out of range', () => {
    expect(parse('آية 300 من سورة البقرة')).toMatchObject({
      status: 'invalid',
      reason: 'ayah_out_of_range',
    });
  });

  it.each(['آية 255', 'آية البقرة', 'آية 255 من سورة', 'آية 255 من سورة البقرة الكهف'])(
    '%s -> none',
    (q) => {
      expect(parse(q)).toEqual(NONE);
    },
  );
});

describe('parseReference: "سورة" + number', () => {
  it.each([
    ['سورة 2:255', ayah(2, 255)],
    ['سورة ٢ آية ٢٥٥', ayah(2, 255)],
    ['سورة 2 الآية 255', ayah(2, 255)],
    ['سورة 18', sura(18, true)],
    ['سورة ١٨', sura(18, true)],
  ])('%s', (q, expected) => {
    expect(parse(q)).toEqual(expected);
  });

  it('unknown sura numbers are invalid', () => {
    expect(parse('سورة 115')).toEqual({
      status: 'invalid',
      reason: 'sura_out_of_range',
      sura: 115,
    });
    expect(parse('سورة 0')).toMatchObject({ status: 'invalid', reason: 'sura_out_of_range' });
  });

  it('"سورة N M" without a separator is not a reference', () => {
    expect(parse('سورة 2 255')).toEqual(NONE);
  });
});

describe('parseReference: sura name only', () => {
  it.each([
    ['سورة الكهف', 18, true],
    ['سوره الكهف', 18, true],
    ['الكهف', 18, false],
    ['الفاتحة', 1, false],
    ['الفاتحه', 1, false],
    ['يس', 36, false],
    ['ياسين', 36, false],
    ['طه', 20, false],
    ['ص', 38, false],
    ['آل عمران', 3, false],
    ['الرحمن', 55, false], // also a Quran word: SearchService marks it ambiguous
    ['فاتحة الكتاب', 1, false],
    ['التوحيد', 112, false],
    ['سورة تبارك', 67, true], // signal-only alias with سورة
    ['سورة بقرة', 2, true],
    ['سورة عم', 78, true],
    ['(سورة الكهف)', 18, true],
  ])('%s -> sura %i (explicit=%s)', (q, n, explicit) => {
    expect(parse(q)).toEqual(sura(n, explicit));
  });

  it.each([
    'بقرة', // article-less form alone is just a word
    'تبارك', // signal-only alias alone: Quran word
    'عم',
    'المؤمن',
    'كهف',
    'سورة',
    'سورة غير موجودة',
    'سورة الكمبيوتر',
    'قل هو الله أحد', // phrase queries stay phrase queries
    'الحمد لله رب العالمين',
    'ق والقرآن المجيد', // starts with a sura name, but is text
    'الكهف والرقيم',
    'البقرة الكهف',
    'الكهف 10 11',
    '',
    '   ',
    '؟!',
    'hello',
    'Al-Baqarah 255', // Latin names are not supported
  ])('%s -> none', (q) => {
    expect(parse(q)).toEqual(NONE);
  });
});

describe('parseReference: limits', () => {
  it('ignores input longer than MAX_REFERENCE_INPUT', () => {
    expect(parse(`2:255${' '.repeat(MAX_REFERENCE_INPUT)}`)).toEqual(NONE);
    expect(parse(`${' '.repeat(MAX_REFERENCE_INPUT - 10)}2:255`)).toEqual(ayah(2, 255));
  });

  it('every canonical name resolves, alone and with its last ayah', () => {
    for (const s of SURAS_FIXTURE) {
      expect([s.nameAr, parse(s.nameAr)]).toEqual([s.nameAr, sura(s.number, false)]);
      expect([s.nameAr, parse(`سورة ${s.nameAr}`)]).toEqual([s.nameAr, sura(s.number, true)]);
      expect(parse(`${s.nameAr} ${s.ayahCount}`)).toEqual(ayah(s.number, s.ayahCount));
      expect(parse(`${s.number}:${s.ayahCount}`)).toEqual(ayah(s.number, s.ayahCount));
      expect(parse(`${s.nameAr} ${s.ayahCount + 1}`)).toMatchObject({
        status: 'invalid',
        reason: 'ayah_out_of_range',
        ayahCount: s.ayahCount,
      });
    }
  });
});
