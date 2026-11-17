import { normalize } from '@quran/text-utils';
import { phonetic, skeleton } from './phonetic';

describe('phonetic (claude.md 5.3 level 1)', () => {
  it.each([
    ['صث', 'سس'],
    ['ذظ', 'زز'],
    ['ض', 'د'],
    ['ط', 'ت'],
    ['ق', 'ك'],
    ['ح', 'ه'],
    ['ع', 'ا'],
  ])('merges %s -> %s', (from, to) => {
    expect(phonetic(from)).toBe(to);
  });

  it('keeps other letters, spaces and digits', () => {
    expect(phonetic('بسم الله 2')).toBe('بسم الله 2');
  });

  it('maps confusable spellings to one key', () => {
    expect(phonetic('الصراط')).toBe(phonetic('السرات'));
    expect(phonetic('اعوذ')).toBe(phonetic('اعوز'));
    expect(phonetic('الضالين')).not.toBe(phonetic('الظالين')); // ض->د, ظ->ز: different groups
  });
});

describe('skeleton (claude.md 5.3 level 2)', () => {
  const same = (a: string, b: string) =>
    expect(skeleton(normalize(a))).toBe(skeleton(normalize(b)));

  it('merges the spellings listed in 5.3', () => {
    same('الرحمن', 'الرحمان');
    same('الصلاة', 'الصلوة');
    same('الصلاة', 'الصلاه');
    same('الربا', 'الربوا');
    same('ذلك', 'ذالك');
  });

  it('merges the مسئول / مسؤول / مسول variants (claude.md 11.7 decision)', () => {
    same('مسئول', 'مسؤول');
    same('مسئول', 'مسول');
  });

  it('keeps the first letter even when it is a long vowel, per word', () => {
    expect(skeleton('اوي يوم')).toBe('ا يم');
    expect(skeleton('و')).toBe('و');
  });
});
