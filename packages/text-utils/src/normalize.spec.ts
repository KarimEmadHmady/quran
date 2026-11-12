import { normalize } from './normalize';

// Characters that look identical to ordinary letters (or are invisible) are built from code
// points, so the test states exactly what is being checked.
const cp = (...codes: number[]) => String.fromCodePoint(...codes);
const KEHEH = cp(0x06a9); // Persian kaf
const FARSI_YEH = cp(0x06cc);
const ALLAH_LIGATURE = cp(0xfdf2);
const LAM_ALEF_LIGATURE = cp(0xfefb);
const BISM_PRESENTATION_FORMS = cp(0xfe91, 0xfeb4, 0xfee2); // initial beh, medial seen, final meem
const ALEF_PLUS_COMBINING_HAMZA = cp(0x0627, 0x0654); // decomposed form of U+0623
const RUB_EL_HIZB = cp(0x06de);
const SAJDA_SIGN = cp(0x06e9);
const END_OF_AYAH = cp(0x06dd);
const SMALL_HIGH_JEEM = cp(0x06da);
const NBSP = cp(0x00a0);

describe('normalize: Al-Fatiha (Uthmani script)', () => {
  it.each([
    ['1:1', 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ', 'بسم الله الرحمن الرحيم'],
    ['1:2', 'ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَٰلَمِينَ', 'الحمد لله رب العلمين'],
    ['1:3', 'ٱلرَّحْمَٰنِ ٱلرَّحِيمِ', 'الرحمن الرحيم'],
    ['1:4', 'مَٰلِكِ يَوْمِ ٱلدِّينِ', 'ملك يوم الدين'],
    ['1:5', 'إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ', 'اياك نعبد واياك نستعين'],
    ['1:6', 'ٱهْدِنَا ٱلصِّرَٰطَ ٱلْمُسْتَقِيمَ', 'اهدنا الصرط المستقيم'],
    [
      '1:7',
      'صِرَٰطَ ٱلَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ ٱلْمَغْضُوبِ عَلَيْهِمْ وَلَا ٱلضَّآلِّينَ',
      'صرط الذين انعمت عليهم غير المغضوب عليهم ولا الضالين',
    ],
  ])('%s', (_ref, input, expected) => {
    expect(normalize(input)).toBe(expected);
  });
});

describe('normalize: Al-Fatiha (text_simple script)', () => {
  it.each([
    ['1:2', 'الحمد لله رب العالمين', 'الحمد لله رب العالمين'],
    ['1:4', 'مالك يوم الدين', 'مالك يوم الدين'],
    ['1:5', 'إياك نعبد وإياك نستعين', 'اياك نعبد واياك نستعين'],
    ['1:6', 'اهدنا الصراط المستقيم', 'اهدنا الصراط المستقيم'],
    [
      '1:7',
      'صراط الذين أنعمت عليهم غير المغضوب عليهم ولا الضالين',
      'صراط الذين انعمت عليهم غير المغضوب عليهم ولا الضالين',
    ],
  ])('%s', (_ref, input, expected) => {
    expect(normalize(input)).toBe(expected);
  });
});

describe('normalize: Ayat al-Kursi (2:255)', () => {
  it('Uthmani script', () => {
    const uthmani =
      'ٱللَّهُ لَآ إِلَٰهَ إِلَّا هُوَ ٱلْحَىُّ ٱلْقَيُّومُ ۚ لَا تَأْخُذُهُۥ سِنَةٌ وَلَا نَوْمٌ ۚ لَّهُۥ مَا فِى ٱلسَّمَٰوَٰتِ وَمَا فِى ٱلْأَرْضِ ۗ مَن ذَا ٱلَّذِى يَشْفَعُ عِندَهُۥٓ إِلَّا بِإِذْنِهِۦ ۚ يَعْلَمُ مَا بَيْنَ أَيْدِيهِمْ وَمَا خَلْفَهُمْ ۖ وَلَا يُحِيطُونَ بِشَىْءٍ مِّنْ عِلْمِهِۦٓ إِلَّا بِمَا شَآءَ ۚ وَسِعَ كُرْسِيُّهُ ٱلسَّمَٰوَٰتِ وَٱلْأَرْضَ ۖ وَلَا يَـُٔودُهُۥ حِفْظُهُمَا ۚ وَهُوَ ٱلْعَلِىُّ ٱلْعَظِيمُ';
    expect(normalize(uthmani)).toBe(
      'الله لا اله الا هو الحي القيوم لا تاخذه سنه ولا نوم له ما في السموت وما في الارض من ذا الذي يشفع عنده الا باذنه يعلم ما بين ايديهم وما خلفهم ولا يحيطون بشي من علمه الا بما شا وسع كرسيه السموت والارض ولا يوده حفظهما وهو العلي العظيم',
    );
  });

  it('text_simple script', () => {
    const simple =
      'الله لا إله إلا هو الحي القيوم لا تأخذه سنة ولا نوم له ما في السماوات وما في الأرض من ذا الذي يشفع عنده إلا بإذنه يعلم ما بين أيديهم وما خلفهم ولا يحيطون بشيء من علمه إلا بما شاء وسع كرسيه السماوات والأرض ولا يئوده حفظهما وهو العلي العظيم';
    expect(normalize(simple)).toBe(
      'الله لا اله الا هو الحي القيوم لا تاخذه سنه ولا نوم له ما في السماوات وما في الارض من ذا الذي يشفع عنده الا باذنه يعلم ما بين ايديهم وما خلفهم ولا يحيطون بشي من علمه الا بما شا وسع كرسيه السماوات والارض ولا ييوده حفظهما وهو العلي العظيم',
    );
  });

  it('a query typed without hamzas matches the normalized ayah text', () => {
    const ayah = normalize('الله لا إله إلا هو الحي القيوم');
    expect(ayah).toContain(normalize('لا اله الا هو'));
  });
});

describe('normalize: letter folding', () => {
  it.each([
    ['alef with hamza above', 'أحد', 'احد'],
    ['alef with hamza below', 'إحسان', 'احسان'],
    ['alef with madda', 'آمن', 'امن'],
    ['alef wasla', 'ٱلكتاب', 'الكتاب'],
    ['waw with hamza', 'مؤمن', 'مومن'],
    ['yeh with hamza', 'بئر', 'بير'],
    ['standalone hamza is dropped', 'شيء', 'شي'],
    ['standalone hamza at the end', 'السماء', 'السما'],
    ['a lone hamza becomes empty', 'ء', ''],
    ['alef maqsura -> yeh', 'موسى', 'موسي'],
    ['teh marbuta -> heh', 'رحمة', 'رحمه'],
    ['teh marbuta in salah', 'الصلاة', 'الصلاه'],
    ['Persian keheh -> kaf', `${KEHEH}تاب`, 'كتاب'],
    ['Persian yeh -> yeh', `ف${FARSI_YEH}`, 'في'],
  ])('%s', (_label, input, expected) => {
    expect(normalize(input)).toBe(expected);
  });
});

describe('normalize: diacritics, tatweel and Quranic marks', () => {
  it.each([
    ['tashkeel incl. tanween and shadda', 'مُحَمَّدٌ', 'محمد'],
    ['dagger alef', 'ٱلرَّحْمَٰنِ', 'الرحمن'],
    ['tatweel', 'اللـــه', 'الله'],
    ['tatweel inside a word', 'الرحمـن', 'الرحمن'],
    ['small high jeem pause mark', `القيوم ${SMALL_HIGH_JEEM} لا`, 'القيوم لا'],
    ['rub el hizb sign', `${RUB_EL_HIZB} إن`, 'ان'],
    ['sajda sign', `يسجدون ${SAJDA_SIGN}`, 'يسجدون'],
    ['end of ayah sign', `الرحيم ${END_OF_AYAH}`, 'الرحيم'],
  ])('%s', (_label, input, expected) => {
    expect(normalize(input)).toBe(expected);
  });
});

describe('normalize: Unicode compatibility (NFKC)', () => {
  it.each([
    ['Allah ligature U+FDF2', ALLAH_LIGATURE, 'الله'],
    ['lam-alef ligature U+FEFB', LAM_ALEF_LIGATURE, 'لا'],
    ['presentation forms', BISM_PRESENTATION_FORMS, 'بسم'],
    ['decomposed alef + combining hamza', `${ALEF_PLUS_COMBINING_HAMZA}حد`, 'احد'],
  ])('%s', (_label, input, expected) => {
    expect(normalize(input)).toBe(expected);
  });
});

describe('normalize: digits', () => {
  it.each([
    ['Arabic-Indic digits', 'البقرة ٢٥٥', 'البقره 255'],
    ['Persian digits', '۲۵۵', '255'],
    ['ASCII digits are kept', '2 255', '2 255'],
    ['reference with a colon', '٢:٢٥٥', '2 255'],
  ])('%s', (_label, input, expected) => {
    expect(normalize(input)).toBe(expected);
  });
});

describe('normalize: punctuation, Latin and whitespace', () => {
  it.each([
    ['Arabic comma and question mark', 'الحمد، لله؟', 'الحمد لله'],
    ['brackets and quotes', '«قل» (هو) "الله"!', 'قل هو الله'],
    ['Latin letters are removed', 'Allah الله abc', 'الله'],
    ['Latin only becomes empty', 'hello world', ''],
    ['collapses and trims whitespace', `  بسم   الله\n\tالرحمن${NBSP} `, 'بسم الله الرحمن'],
    ['empty string', '', ''],
    ['whitespace only', ' \n\t ', ''],
  ])('%s', (_label, input, expected) => {
    expect(normalize(input)).toBe(expected);
  });
});

describe('normalize: repeated characters', () => {
  it.each([
    ['3+ repeats collapse to 2', 'ههههه', 'هه'],
    ['exactly 3 collapses to 2', 'ااا', 'اا'],
    ['the double lam in Allah is kept', 'الله', 'الله'],
    ['repeats left after removing diacritics collapse', 'لَلَلَل', 'لل'],
    // Documented side effect of claude.md 5.2: the rule applies to digits too.
    ['digit runs also collapse (1000 -> 100)', '1000', '100'],
  ])('%s', (_label, input, expected) => {
    expect(normalize(input)).toBe(expected);
  });
});

describe('normalize: search equivalence (properties the engine relies on)', () => {
  it('all hamza spellings of iyyaka meet', () => {
    const forms = ['إياك نعبد', 'اياك نعبد', 'أياك نعبد', 'إِيَّاكَ نَعْبُدُ'].map(normalize);
    expect(new Set(forms).size).toBe(1);
  });

  it('teh marbuta and heh spellings meet', () => {
    expect(normalize('رحمة')).toBe(normalize('رحمه'));
  });

  it('shay with and without the final hamza meet', () => {
    expect(normalize('شيء')).toBe(normalize('شي'));
  });

  it('does NOT merge dad and zah (dalleen vs zalleen stay different)', () => {
    expect(normalize('الضالين')).not.toBe(normalize('الظالين'));
  });

  it('does NOT merge yaalamoon and yaamaloon', () => {
    expect(normalize('يعلمون')).not.toBe(normalize('يعملون'));
  });

  // claude.md 5.2 says these three "all match"; with the specified code they do not, because
  // the seat letters (waw / yeh) are kept and only the standalone hamza is dropped.
  it('documents: mas-ool spellings with hamza seats stay distinct', () => {
    expect(normalize('مسؤول')).toBe('مسوول');
    expect(normalize('مسئول')).toBe('مسيول');
    expect(normalize('مسول')).toBe('مسول');
  });

  it('is idempotent on mixed input', () => {
    const samples = ['ٱلرَّحْمَٰنِ ٱلرَّحِيمِ', 'ههههه ١٢٣ abc', ALLAH_LIGATURE, '  ء  '];
    for (const s of samples) expect(normalize(normalize(s))).toBe(normalize(s));
  });

  it('output only contains Arabic letters U+0621..U+064A, ASCII digits and single spaces', () => {
    const out = normalize('ٱلْحَمْدُ لِلَّهِ ۚ «test» ٣ ۝ ﷲ');
    expect(out).toMatch(/^[ء-ي0-9]+( [ء-ي0-9]+)*$/);
  });
});
