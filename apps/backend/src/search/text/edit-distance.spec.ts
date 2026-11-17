import {
  KEYBOARD_NEIGHBOUR_COST,
  areKeyboardNeighbours,
  editDistance,
  maxEditCost,
} from './edit-distance';

describe('areKeyboardNeighbours (Arabic 101 layout)', () => {
  it.each([
    ['ض', 'ص'], // claude.md 5.5 examples
    ['ي', 'ب'],
    ['ي', 'س'], // row 2: ش س ي ب
    ['ت', 'ن'],
    ['ش', 'ض'], // staggered rows: row-2 key under row-1 keys i and i+1
    ['ش', 'ص'],
    ['ر', 'ب'], // bottom row
  ])('%s/%s are neighbours (both ways)', (a, b) => {
    expect(areKeyboardNeighbours(a, b)).toBe(true);
    expect(areKeyboardNeighbours(b, a)).toBe(true);
  });

  it.each([
    ['ض', 'ظ'],
    ['ب', 'س'], // two keys apart (س ي ب)
    ['ض', 'ض'],
    ['ذ', 'ض'], // ذ sits on the number row
    ['x', 'ض'],
  ])('%s/%s are not neighbours', (a, b) => {
    expect(areKeyboardNeighbours(a, b)).toBe(false);
  });
});

describe('editDistance (weighted Damerau-Levenshtein, OSA)', () => {
  it('basic operations cost 1', () => {
    expect(editDistance('الرحمن', 'الرحمن')).toBe(0);
    expect(editDistance('الرحم', 'الرحيم')).toBe(1); // insert
    expect(editDistance('الرحيم', 'الرحم')).toBe(1); // delete
    expect(editDistance('الرحمم', 'الرحيم')).toBe(1); // substitute (non-neighbours)
    expect(editDistance('', 'ابت')).toBe(3);
  });

  it('an adjacent transposition is ONE edit (claude.md 5.5: الرحمن / الرحنم)', () => {
    expect(editDistance('الرحنم', 'الرحمن')).toBe(1);
    expect(editDistance('ab', 'ba')).toBe(1);
  });

  it('keyboard-neighbour substitutions are cheaper', () => {
    expect(editDistance('الدبن', 'الدين')).toBe(KEYBOARD_NEIGHBOUR_COST);
    expect(editDistance('صرب', 'ضرب')).toBe(KEYBOARD_NEIGHBOUR_COST);
  });

  it('returns Infinity beyond max (early exit and length gap)', () => {
    expect(editDistance('الرحمن', 'الكتاب', 1)).toBe(Infinity);
    expect(editDistance('ا', 'ابتث', 2)).toBe(Infinity);
    expect(editDistance('الرحم', 'الرحيم', 1)).toBe(1);
    expect(editDistance('ابتث', 'ابتجح', 1)).toBe(Infinity); // last cell above max
  });
});

describe('maxEditCost (claude.md 5.5 thresholds)', () => {
  it.each([
    [1, 0],
    [3, 0],
    [4, 1],
    [5, 1],
    [6, 2],
    [11, 2],
  ])('length %i -> %i', (len, max) => {
    expect(maxEditCost(len)).toBe(max);
  });
});
