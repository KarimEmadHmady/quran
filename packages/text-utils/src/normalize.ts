// The ONE search normalization (claude.md 5.2). Applied identically to text_simple at index
// time, to user queries and to STT output. Backend and frontend must import it from here;
// never copy it. Any change here changes search results: update the tests and re-index.
//
// The code below is claude.md 5.2 verbatim (only formatting differs).

const DIACRITICS = /[\u064B-\u065F\u0670\u06D6-\u06ED\u08D3-\u08FF]/g; // tashkeel + dagger alef + Quranic annotation marks
const TATWEEL = /\u0640/g;
const AR_DIGITS = /[\u0660-\u0669]/g; // Arabic-Indic digits
const FA_DIGITS = /[\u06F0-\u06F9]/g; // Extended Arabic-Indic (Persian) digits

export function normalize(input: string): string {
  let s = input.normalize('NFKC'); // unfolds presentation forms (e.g. U+FDF2 -> Allah)
  s = s.replace(DIACRITICS, '').replace(TATWEEL, '');

  s = s
    .replace(/[\u0623\u0625\u0622\u0671]/g, '\u0627') // alef with hamza above/below, madda, wasla -> bare alef
    .replace(/\u0624/g, '\u0648') // waw with hamza -> waw
    .replace(/\u0626/g, '\u064A') // yeh with hamza -> yeh
    .replace(/\u0621/g, '') // standalone hamza -> removed
    .replace(/\u0649/g, '\u064A') // alef maqsura -> yeh
    .replace(/\u0629/g, '\u0647') // teh marbuta -> heh
    .replace(/\u06A9/g, '\u0643') // Persian keheh -> kaf
    .replace(/\u06CC/g, '\u064A'); // Persian yeh -> yeh

  s = s
    .replace(AR_DIGITS, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(FA_DIGITS, (d) => String(d.charCodeAt(0) - 0x06f0));

  s = s.replace(/[^\u0621-\u064A0-9\s]/g, ' '); // drop symbols, punctuation, Latin
  s = s.replace(/(.)\1{2,}/g, '$1$1'); // 3+ repeats -> 2 (not 1, to keep the double lam in Allah)
  return s.replace(/\s+/g, ' ').trim();
}
