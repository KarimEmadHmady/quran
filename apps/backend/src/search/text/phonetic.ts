/**
 * Phonetic keys (claude.md 5.3), applied to normalize() output only.
 *
 * Level 1, phonetic(): merges letters that speech-to-text and dialects confuse.
 * Level 2, skeleton(): phonetic() without the long vowels ا و ي after the first letter, so
 *   الرحمن/الرحمان, الصلاة/الصلوة, الربا/الربوا, ذلك/ذالك share a key. It merges many
 *   different words, so it is the corrector's LAST resort with the lowest weight.
 */
const GROUPS: ReadonlyArray<[to: string, from: string]> = [
  ['س', 'صث'],
  ['ز', 'ذظ'],
  ['د', 'ض'],
  ['ت', 'ط'],
  ['ك', 'ق'],
  ['ه', 'ح'],
  ['ا', 'ع'],
];

const MAP = new Map<string, string>();
for (const [to, from] of GROUPS) for (const ch of from) MAP.set(ch, to);

export function phonetic(normalized: string): string {
  let out = '';
  for (const ch of normalized) out += MAP.get(ch) ?? ch;
  return out;
}

/** Per word: keep the first letter, drop ا و ي everywhere after it. */
export function skeleton(normalized: string): string {
  return phonetic(normalized)
    .split(' ')
    .map((w) => (w.length <= 1 ? w : w[0] + w.slice(1).replace(/[اوي]/g, '')))
    .join(' ');
}
