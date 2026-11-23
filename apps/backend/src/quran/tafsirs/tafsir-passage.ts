import { normalize } from '@quran/text-utils';

/**
 * Al-Qurtubi often explains several consecutive ayahs in ONE section, and the source data stores
 * that whole section on every ayah it covers (same text, byte for byte). This module splits such
 * a shared passage into one part per ayah — but ONLY when the ayah boundaries are explicit in the
 * text itself; otherwise the passage is shown whole with its ayah range (never guessed).
 *
 * A part is always an exact slice of the stored text: parts are never edited, trimmed or
 * normalized, and together they rebuild the passage exactly (checked before use).
 *
 * Rules (any doubt => no split):
 *  - Boundaries are Qurtubi's own headings «قوله تعالى{…}» (and the same with عز وجل / سبحانه /
 *    جل وعز). A heading followed by a source reference «[سورة: n]» quotes another place and is
 *    ignored.
 *  - A heading moves the passage to the next ayah only when its quote matches (whole words, after
 *    search normalization) exactly ONE ayah of the passage, and that ayah is the next one.
 *  - That heading must start a section: at the very start, right after a sentence end, or right
 *    after a numbered marker («الثانية:», «الحادية والعشرون:»). The marker moves with it. A heading
 *    in the middle of a sentence is never a boundary.
 *  - Unsplittable when: a section-starting heading goes back to an earlier ayah, skips an ayah,
 *    matches several later ayahs, or opens the next ayah mid-sentence; or when an ayah is left
 *    without a heading of its own.
 */

export interface PassageMember {
  /** The ayah's simple (imla'i) text, as stored in ayahs.text_simple. */
  text: string;
}

export type PassageSplit = { ok: true; parts: string[] } | { ok: false; reason: string };

const HEADING =
  /(?:قوله تعالى|قوله عز وجل|قوله سبحانه|قوله جل وعز)\s*:?\s*\{([^{}]{1,300})\}(\s*\[[^\]]*\])?/g;

const UNIT =
  '(?:الأولى|الثانية|الثالثة|الرابعة|الخامسة|السادسة|السابعة|الثامنة|التاسعة|العاشرة|الحادية|الحادي)';
const TENS = '(?:العشرون|الثلاثون|الأربعون|الخمسون|الستون|السبعون|الثمانون|التسعون)';
/** A numbered section marker right before a heading: «الرابعة: », «الحادية والعشرون : ». */
const MARKER_BEFORE = new RegExp(
  `(?:${UNIT}(?:\\s+عشرة?)?(?:\\s+و${TENS})?|${TENS})\\s*[:：]\\s*$`,
);
/** Characters after which a new section may start. */
const SECTION_END = /[.:：؛!؟?}\])"»]$/;

/** Search-normalized words, padded so `includes` matches whole words only. */
const words = (s: string) => ` ${normalize(s)} `;

/** Where a section starting with the heading at `at` begins, or null when it is mid-sentence. */
function sectionStart(content: string, at: number): number | null {
  const before = content.slice(Math.max(0, at - 80), at);
  const marker = MARKER_BEFORE.exec(before);
  const start = marker ? at - (before.length - marker.index) : at;
  const prev = content.slice(0, start).trimEnd();
  if (prev.length === 0 || SECTION_END.test(prev)) return start;
  return null;
}

export function splitPassage(content: string, members: readonly PassageMember[]): PassageSplit {
  if (members.length < 2) return { ok: false, reason: 'single ayah' };
  const texts = members.map((m) => words(m.text));
  const starts = [0];
  let cur = 0;
  let curHasHeading = false;

  for (const m of content.matchAll(HEADING)) {
    if (m[2]) continue; // «… [سورة: n]»: quotes another place
    const quote = normalize(m[1]);
    if (quote.length === 0) continue;
    const hits = texts.flatMap((t, i) => (t.includes(` ${quote} `) ? [i] : []));
    if (hits.length === 0) continue; // a verse outside this passage
    if (hits.includes(cur)) {
      curHasHeading = true; // still the current ayah
      continue;
    }
    const at = m.index ?? 0;
    const start = sectionStart(content, at);
    if (start === null) {
      // A quote inside a sentence: harmless when it looks back, ambiguous when it looks ahead.
      if (hits.every((i) => i < cur)) continue;
      return { ok: false, reason: `ayah ${cur + 2} first quoted mid-sentence at ${at}` };
    }
    if (hits.every((i) => i < cur))
      return { ok: false, reason: `section at ${at} goes back to an earlier ayah` };
    if (hits.length !== 1 || hits[0] !== cur + 1)
      return { ok: false, reason: `section at ${at} does not open the next ayah` };
    if (!curHasHeading) return { ok: false, reason: `ayah ${cur + 1} has no heading of its own` };
    if (start <= starts[starts.length - 1]) return { ok: false, reason: `empty part before ${at}` };
    starts.push(start);
    cur += 1;
    curHasHeading = true;
  }

  if (cur !== members.length - 1)
    return { ok: false, reason: `only ${cur + 1}/${members.length} ayahs have a heading` };
  if (!curHasHeading) return { ok: false, reason: 'last ayah has no heading of its own' };
  const parts = starts.map((s, i) => content.slice(s, starts[i + 1] ?? content.length));
  // Exact slices of the stored text, in order: they must rebuild it byte for byte.
  if (parts.join('') !== content || parts.some((p) => p.length === 0))
    return { ok: false, reason: 'parts do not rebuild the text' };
  return { ok: true, parts };
}
