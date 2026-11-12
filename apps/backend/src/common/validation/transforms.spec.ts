import type { TransformFnParams } from 'class-transformer';
import { toIntList, toStrictBoolean, toStrictInt } from './transforms';

const p = (value: unknown) => ({ value }) as TransformFnParams;

describe('toStrictInt', () => {
  it.each([
    ['1', 1],
    ['114', 114],
    ['007', 7],
  ])('converts %p', (input, out) => expect(toStrictInt(p(input))).toBe(out));

  it.each(['', ' 1', '1 ', '-1', '1.5', '1e2', '0x10', 'abc', '1234567890'])(
    'leaves %p unchanged',
    (input) => expect(toStrictInt(p(input))).toBe(input),
  );

  it('leaves non-strings (e.g. repeated params as arrays) unchanged', () => {
    expect(toStrictInt(p(['1', '2']))).toEqual(['1', '2']);
    expect(toStrictInt(p(undefined))).toBeUndefined();
  });
});

describe('toIntList', () => {
  it('splits, converts and deduplicates keeping order', () => {
    expect(toIntList(p('1'))).toEqual([1]);
    expect(toIntList(p('5,1,5'))).toEqual([5, 1]);
  });

  it.each(['', '1,', ',1', '1,,2', '1, 2', '1,a', '1.5'])('leaves %p unchanged', (input) =>
    expect(toIntList(p(input))).toBe(input),
  );

  it('leaves non-strings unchanged', () => {
    expect(toIntList(p(['1']))).toEqual(['1']);
  });
});

describe('toStrictBoolean', () => {
  it('converts only "true"/"false"', () => {
    expect(toStrictBoolean(p('true'))).toBe(true);
    expect(toStrictBoolean(p('false'))).toBe(false);
    expect(toStrictBoolean(p('1'))).toBe('1');
    expect(toStrictBoolean(p('TRUE'))).toBe('TRUE');
  });
});
