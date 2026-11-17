import { normalize } from '@quran/text-utils';
import { MAX_NAME_WORDS, type SuraCatalog } from './sura-catalog';

/**
 * Reference queries (claude.md 5.6 stage 0, S4). The WHOLE query must be a reference;
 * anything else returns { status: 'none' } and is left to text search.
 *
 * Supported forms (digits may be Western 0-9, Arabic-Indic ٠-٩ or Persian ۰-۹):
 *   2:255   ٢:٢٥٥   2 : 255   2/255   (2:255)   ﴿٢:٢٥٥﴾      numeric sura:ayah
 *   سورة 2:255   سورة 2 آية 255   سورة ٢                   "سورة" + sura number
 *   البقرة 255   البقرة: 255   [البقرة: 255]   البقرة، 255   name + ayah
 *   سورة البقرة آية 255   البقرة الآية رقم 255             optional keywords
 *   آية 255 من سورة البقرة   الآية 255 البقرة               ayah first
 *   الكهف   سورة الكهف   سورة تبارك   بقره 5                sura only -> ayah 1
 *
 * Numbers are read from the RAW text: normalize() collapses repeated characters, which
 * would turn "يوسف 111" into "يوسف 11" (claude.md 11.6 (ب)). Only words go through normalize().
 */

export interface AyahReference {
  kind: 'ayah';
  sura: number;
  ayah: number;
}

export interface SuraReference {
  kind: 'sura';
  sura: number;
  /** True when the query said "سورة"; a bare name may also be ordinary text. */
  explicit: boolean;
}

export type InvalidReason = 'sura_out_of_range' | 'ayah_out_of_range';

export type ReferenceParse =
  | { status: 'none' }
  | { status: 'ok'; ref: AyahReference | SuraReference }
  | {
      status: 'invalid';
      reason: InvalidReason;
      sura: number;
      ayah?: number;
      /** Ayahs in the sura (ayah_out_of_range only), for a "sura X has N ayahs" message. */
      ayahCount?: number;
    };

/** Same input cap as search (claude.md 10). Longer input is never a reference. */
export const MAX_REFERENCE_INPUT = 200;
/** Longer digit runs are never sura/ayah numbers. */
const MAX_DIGITS = 4;

const NONE: ReferenceParse = { status: 'none' };
const SURA_KEYWORD = 'سوره'; // normalize('سورة')
const AYAH_KEYWORDS = new Set(['ايه', 'الايه']); // normalize('آية') / normalize('الآية')
const NUMBER_KEYWORD = 'رقم';
const FROM_KEYWORD = 'من';

type Token = { t: 'num'; v: number } | { t: 'colon' } | { t: 'word'; v: string };

/** Arabic-Indic (٠-٩) and Persian (۰-۹) digits -> ASCII. */
export function toAsciiDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/** Tokens of a reference candidate, or null when the input cannot be a reference. */
function lex(raw: string): Token[] | null {
  const s = toAsciiDigits(raw.normalize('NFKC')) // NFKC also maps "：" to ":"
    .replace(/[()[\]{}﴾﴿«»"'“”]/g, ' ') // brackets, ﴾﴿, quotes
    .replace(/[:/]/g, ' : ')
    .replace(/[،,؛;–—-]/g, ' ') // ، , ؛ ; dashes: soft separators
    .replace(/(\d+)/g, ' $1 ');

  const tokens: Token[] = [];
  for (const part of s.split(/\s+/)) {
    if (part === '') continue;
    if (part === ':') {
      tokens.push({ t: 'colon' });
    } else if (/^\d+$/.test(part)) {
      if (part.length > MAX_DIGITS) return null;
      tokens.push({ t: 'num', v: Number(part) });
    } else {
      const words = normalize(part);
      if (words === '') {
        // Letters normalize() drops (Latin, ...) mean "not a reference"; pure punctuation or
        // stray diacritics are just noise.
        if (/\p{L}/u.test(part)) return null;
        continue;
      }
      for (const w of words.split(' ')) {
        if (w.startsWith(SURA_KEYWORD) && w.length > SURA_KEYWORD.length) {
          // "سورةالبقرة" typed without the space.
          tokens.push(
            { t: 'word', v: SURA_KEYWORD },
            { t: 'word', v: w.slice(SURA_KEYWORD.length) },
          );
        } else {
          tokens.push({ t: 'word', v: w });
        }
      }
    }
  }
  return tokens;
}

/** A small cursor over the token list; each grammar form works on its own clone. */
class Cursor {
  constructor(
    private readonly tokens: readonly Token[],
    private pos = 0,
  ) {}

  clone(): Cursor {
    return new Cursor(this.tokens, this.pos);
  }

  get done(): boolean {
    return this.pos >= this.tokens.length;
  }

  word(accepted: string): boolean {
    const tok = this.tokens[this.pos];
    if (tok?.t !== 'word' || tok.v !== accepted) return false;
    this.pos++;
    return true;
  }

  /** "آية" / "الآية", optionally followed by "رقم". */
  ayahWord(): boolean {
    const tok = this.tokens[this.pos];
    if (tok?.t !== 'word' || !AYAH_KEYWORDS.has(tok.v)) return false;
    this.pos++;
    this.word(NUMBER_KEYWORD);
    return true;
  }

  colon(): boolean {
    if (this.tokens[this.pos]?.t !== 'colon') return false;
    this.pos++;
    return true;
  }

  num(): number | undefined {
    const tok = this.tokens[this.pos];
    if (tok?.t !== 'num') return undefined;
    this.pos++;
    return tok.v;
  }

  /** Longest sura name (up to MAX_NAME_WORDS words) starting here. */
  name(catalog: SuraCatalog, signalled: boolean): number | undefined {
    for (let n = MAX_NAME_WORDS; n >= 1; n--) {
      const slice = this.tokens.slice(this.pos, this.pos + n);
      if (slice.length < n) continue;
      const words: string[] = [];
      for (const t of slice) if (t.t === 'word') words.push(t.v);
      if (words.length < n) continue;
      const sura = catalog.lookupName(words.join(' '), signalled);
      if (sura !== undefined) {
        this.pos += n;
        return sura;
      }
    }
    return undefined;
  }
}

function resolve(
  catalog: SuraCatalog,
  sura: number,
  ayah: number | undefined,
  explicit: boolean,
): ReferenceParse {
  const info = catalog.get(sura);
  if (!info) {
    return {
      status: 'invalid',
      reason: 'sura_out_of_range',
      sura,
      ...(ayah !== undefined && { ayah }),
    };
  }
  if (ayah === undefined) return { status: 'ok', ref: { kind: 'sura', sura, explicit } };
  if (ayah < 1 || ayah > info.ayahCount) {
    return {
      status: 'invalid',
      reason: 'ayah_out_of_range',
      sura,
      ayah,
      ayahCount: info.ayahCount,
    };
  }
  return { status: 'ok', ref: { kind: 'ayah', sura, ayah } };
}

type Form = (c: Cursor, catalog: SuraCatalog) => ReferenceParse | null;

/** [سورة] N : N   |   سورة N [[:|آية] N] */
const numericForm: Form = (c, catalog) => {
  const keyword = c.word(SURA_KEYWORD);
  const sura = c.num();
  if (sura === undefined) return null;
  if (c.done) return keyword ? resolve(catalog, sura, undefined, true) : null; // bare "255": no
  const separated = c.colon() || (keyword && c.ayahWord());
  const ayah = separated ? c.num() : undefined;
  if (ayah === undefined || !c.done) return null;
  return resolve(catalog, sura, ayah, keyword);
};

/** [سورة] NAME [[:] [آية [رقم]] N] */
const suraFirstForm: Form = (c, catalog) => {
  const keyword = c.word(SURA_KEYWORD);
  // Strict first: names usable as they are. Then loose: 'signal'-only names ("بقره",
  // "تبارك"), which without "سورة" are accepted only when an ayah number follows.
  for (const loose of keyword ? [true] : [false, true]) {
    const k = c.clone();
    const sura = k.name(catalog, loose);
    if (sura === undefined) continue;
    if (k.done) {
      if (keyword || !loose) return resolve(catalog, sura, undefined, keyword);
      continue;
    }
    k.colon();
    k.ayahWord();
    const ayah = k.num();
    if (ayah !== undefined && k.done) return resolve(catalog, sura, ayah, keyword);
  }
  return null;
};

/** آية [رقم] N [من] [سورة] NAME */
const ayahFirstForm: Form = (c, catalog) => {
  if (!c.ayahWord()) return null;
  const ayah = c.num();
  if (ayah === undefined) return null;
  c.word(FROM_KEYWORD);
  c.word(SURA_KEYWORD);
  const sura = c.name(catalog, true); // "آية N" is the signal
  if (sura === undefined || !c.done) return null;
  return resolve(catalog, sura, ayah, true);
};

const FORMS: readonly Form[] = [numericForm, suraFirstForm, ayahFirstForm];

/** Parses a whole query as a sura/ayah reference (see the module comment for the forms). */
export function parseReference(raw: string, catalog: SuraCatalog): ReferenceParse {
  if (raw.length > MAX_REFERENCE_INPUT) return NONE;
  const tokens = lex(raw);
  if (!tokens || tokens.length === 0) return NONE;
  for (const form of FORMS) {
    const result = form(new Cursor(tokens), catalog);
    if (result) return result;
  }
  return NONE;
}
