import { splitPassage } from './tafsir-passage';

// Ayah texts are the simple (imla'i) text; quotes match after search normalization.
const A1 = { text: 'إن الذين آمنوا وعملوا الصالحات' };
const A2 = { text: 'جزاؤهم عند ربهم جنات عدن' };
const A3 = { text: 'ذلك لمن خشي ربه' };

describe('splitPassage', () => {
  it('splits at the headings of each ayah; the parts are exact slices that rebuild the text', () => {
    const text =
      'قوله تعالى {إن الذين آمنوا} شرح الأولى. قوله تعالى {جزاؤهم عند ربهم} شرح الثانية.';
    const r = splitPassage(text, [A1, A2]);
    expect(r).toEqual({
      ok: true,
      parts: [
        'قوله تعالى {إن الذين آمنوا} شرح الأولى. ',
        'قوله تعالى {جزاؤهم عند ربهم} شرح الثانية.',
      ],
    });
    if (r.ok) expect(r.parts.join('')).toBe(text);
  });

  it('keeps a numbered section marker with its heading, and the preamble with the first ayah', () => {
    const text =
      'فيه ثلاث مسائل: الأولى: قوله تعالى{الذين آمنوا} كذا. الثانية: فيه كذا. الثالثة : قوله تعالى: {جنات عدن} كذا.';
    const r = splitPassage(text, [A1, A2]);
    expect(r.ok && r.parts).toEqual([
      'فيه ثلاث مسائل: الأولى: قوله تعالى{الذين آمنوا} كذا. الثانية: فيه كذا. ',
      'الثالثة : قوله تعالى: {جنات عدن} كذا.',
    ]);
  });

  it('handles compound markers («الحادية والعشرون:», «الثالثة عشرة:»)', () => {
    const t1 = 'قوله تعالى {الذين آمنوا} كذا. الحادية والعشرون: قوله تعالى {جزاؤهم} كذا.';
    expect(splitPassage(t1, [A1, A2])).toMatchObject({
      ok: true,
      parts: [expect.any(String), 'الحادية والعشرون: قوله تعالى {جزاؤهم} كذا.'],
    });
    const t2 = 'قوله تعالى {الذين آمنوا} كذا. الثالثة عشرة: قوله تعالى {جزاؤهم} كذا.';
    expect(splitPassage(t2, [A1, A2])).toMatchObject({
      ok: true,
      parts: [expect.any(String), 'الثالثة عشرة: قوله تعالى {جزاؤهم} كذا.'],
    });
  });

  it('splits three ayahs in order', () => {
    const text = 'قوله تعالى {آمنوا} أ. قوله تعالى {جنات عدن} ب. قوله تعالى {لمن خشي ربه} ج.';
    const r = splitPassage(text, [A1, A2, A3]);
    expect(r.ok && r.parts).toEqual([
      'قوله تعالى {آمنوا} أ. ',
      'قوله تعالى {جنات عدن} ب. ',
      'قوله تعالى {لمن خشي ربه} ج.',
    ]);
  });

  it('does not split when an ayah has no heading of its own (shown whole)', () => {
    const text = 'قوله تعالى {إن الذين آمنوا} شرح يشمل {جزاؤهم عند ربهم} أيضا.';
    expect(splitPassage(text, [A1, A2])).toMatchObject({ ok: false });
  });

  it('never splits at a heading in the middle of a sentence', () => {
    const text = 'قوله تعالى {إن الذين آمنوا} شرح، ومثله قوله تعالى {جزاؤهم عند ربهم} في المعنى.';
    expect(splitPassage(text, [A1, A2])).toMatchObject({ ok: false });
  });

  it('ignores headings with a source reference (they quote another place)', () => {
    const text = 'قوله تعالى {الذين آمنوا} كذا. قوله تعالى {جزاؤهم عند ربهم} [البينة: 8] كذا.';
    expect(splitPassage(text, [A1, A2])).toMatchObject({ ok: false });
  });

  it('does not split when a section skips an ayah', () => {
    const text = 'قوله تعالى {آمنوا} أ. قوله تعالى {لمن خشي ربه} ج.';
    expect(splitPassage(text, [A1, A2, A3])).toMatchObject({ ok: false });
  });

  it('does not split when a section goes back to an earlier ayah', () => {
    const text = 'قوله تعالى {آمنوا} أ. قوله تعالى {جنات عدن} ب. قوله تعالى {وعملوا الصالحات} عود.';
    expect(splitPassage(text, [A1, A2])).toMatchObject({ ok: false });
  });

  it('does not split when the next heading matches several ayahs (ambiguous)', () => {
    const B1 = { text: 'قال ألم أقل لك' };
    const B2 = { text: 'قال إن سألتك' };
    const B3 = { text: 'قال هذا فراق' };
    const text = 'قوله تعالى {ألم أقل لك} أ. قوله تعالى {قال} ب.';
    expect(splitPassage(text, [B1, B2, B3])).toMatchObject({ ok: false });
  });

  it('a quote matching the current ayah too keeps the current ayah', () => {
    const B1 = { text: 'قال ألم أقل لك' };
    const B2 = { text: 'قال إن سألتك' };
    const text = 'قوله تعالى {قال} الخضر. قوله تعالى {قال إن سألتك} ب.';
    expect(splitPassage(text, [B1, B2])).toMatchObject({
      ok: true,
      parts: ['قوله تعالى {قال} الخضر. ', 'قوله تعالى {قال إن سألتك} ب.'],
    });
  });

  it('matches whole words only', () => {
    // «آمن» is not the word «آمنوا»: no heading for ayah 1 => not split.
    const text = 'قوله تعالى {آمن} أ. قوله تعالى {جنات عدن} ب.';
    expect(splitPassage(text, [A1, A2])).toMatchObject({ ok: false });
  });

  it('a single ayah is never a passage', () => {
    expect(splitPassage('قوله تعالى {آمنوا} أ.', [A1])).toMatchObject({ ok: false });
  });
});
