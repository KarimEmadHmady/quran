/**
 * Damerau-Levenshtein distance (optimal string alignment) for the token corrector
 * (claude.md 5.5): insert / delete / adjacent transposition cost 1; substitution costs 1, or
 * KEYBOARD_NEIGHBOUR_COST for letters next to each other on the Arabic keyboard
 * (ض/ص, ي/ب/س, ت/ن ...), the most common slip.
 */
export const KEYBOARD_NEIGHBOUR_COST = 0.5;

/**
 * Standard Arabic (101) layout, letter keys only, rows top to bottom. Letters that
 * normalize() rewrites (أ ة ى ؤ ئ ء) map onto their normalized key elsewhere, so they are
 * left out. Rows are staggered: key i of a row sits between keys i-1 and i of the row above.
 */
const ROWS = ['ضصثقفغعهخحجد', 'شسيبلاتنمكط', 'رزظو'];
// Bottom row physically: ئ ء ؤ ر لا ى ة و ز ظ; after normalize only ر و ز ظ remain, with gaps.
const BOTTOM: ReadonlyArray<[string, number]> = [
  ['ر', 3],
  ['و', 7],
  ['ز', 8],
  ['ظ', 9],
];

function buildNeighbours(): Map<string, Set<string>> {
  const pos = new Map<string, [row: number, col: number]>();
  [...ROWS[0]].forEach((ch, i) => pos.set(ch, [0, i]));
  [...ROWS[1]].forEach((ch, i) => pos.set(ch, [1, i]));
  for (const [ch, i] of BOTTOM) pos.set(ch, [2, i]);
  pos.set('ذ', [-1, 0]); // the key left of 1, far from the letter rows: no neighbours

  const out = new Map<string, Set<string>>();
  for (const [a, [ra, ca]] of pos) {
    for (const [b, [rb, cb]] of pos) {
      if (a === b || ra < 0 || rb < 0) continue;
      const sameRow = ra === rb && Math.abs(ca - cb) === 1;
      // staggered rows: lower-row key c touches upper-row keys c and c+1
      const lower = ra > rb ? ca : cb;
      const upper = ra > rb ? cb : ca;
      const adjacentRow = Math.abs(ra - rb) === 1 && (upper === lower || upper === lower + 1);
      if (sameRow || adjacentRow) {
        if (!out.has(a)) out.set(a, new Set());
        out.get(a)!.add(b);
      }
    }
  }
  return out;
}

const NEIGHBOURS = buildNeighbours();

export function areKeyboardNeighbours(a: string, b: string): boolean {
  return NEIGHBOURS.get(a)?.has(b) ?? false;
}

function substitutionCost(a: string, b: string): number {
  if (a === b) return 0;
  return areKeyboardNeighbours(a, b) ? KEYBOARD_NEIGHBOUR_COST : 1;
}

/**
 * Weighted OSA distance between a and b, or Infinity as soon as it must exceed `max`
 * (early exit keeps candidate checks cheap).
 */
export function editDistance(a: string, b: string, max = Infinity): number {
  if (Math.abs(a.length - b.length) > max) return Infinity;
  const n = a.length;
  const m = b.length;
  let prev2 = new Array<number>(m + 1).fill(0);
  let prev = Array.from({ length: m + 1 }, (_, j) => j);
  let cur = new Array<number>(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= m; j++) {
      let v = Math.min(
        prev[j] + 1, // delete
        cur[j - 1] + 1, // insert
        prev[j - 1] + substitutionCost(a[i - 1], b[j - 1]),
      );
      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1] &&
        a[i - 1] !== b[j - 1]
      ) {
        v = Math.min(v, prev2[j - 2] + 1); // adjacent transposition
      }
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return Infinity;
    [prev2, prev, cur] = [prev, cur, prev2];
  }
  return prev[m] <= max ? prev[m] : Infinity;
}

/**
 * claude.md 5.5: no fuzzy matching up to 3 letters, <= 1 for 4-5 letters, <= 2 from 6.
 * Voice (5.7 "wider tolerance"): one more edit from 4 letters (STT output is checked against
 * the whole query, so a looser word match is still constrained by its neighbours).
 */
export function maxEditCost(length: number, voice = false): number {
  if (length <= 3) return 0;
  return (length <= 5 ? 1 : 2) + (voice ? 1 : 0);
}
