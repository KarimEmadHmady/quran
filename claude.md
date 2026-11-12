# claude.md — خطة تطبيق القرآن الكريم (NestJS + Next.js + MySQL)

> المرجع الرئيسي للمشروع. مبني على فحص فعلي لملف `quran-new-v3.sql` وملف `quran-app-v2-spec.md`.
> تركيز الخطة: **محرك البحث** (أخطاء الكتابة + البحث الصوتي). باقي الميزات مختصرة ومحال فيها على الـ spec.

---

## 0. نتائج فحص الملفات (لازم تتقرا الأول)

### اللي اتأكدت منه من الداتا بيز
| البند | النتيجة |
|---|---|
| المحرك | **MySQL 8.0** (من هيدر الـ dump)، `utf8mb4_unicode_ci` |
| الآيات | 6236 آية في `ayahs` |
| `text_simple` | **من غير تشكيل** (فحصت الـ 6236، صفر تشكيل) **لكن لسه فيه** `أ إ آ ؤ ئ ء ى ة` → يعني **مش مطبّع للبحث** |
| `text_uthmani` | مشكّل بالرسم العثماني (ٱ، ألف خنجرية ٰ، ۟ ...) |
| التفاسير | `tafsirs` فيه 4 كتب: كتاب 1 (القرطبي) = 6236 صف، كتاب 2 = 6236، كتاب 4 = 6236، كتاب 3 = 12 صف |
| المواضيع | 183 موضوع في `categories`، 3 منهم `is_banned=1`، و6824 ربط في `category_ayah` |
| الأدمن | جدول `admins` موجود وفاضي |
| الفهارس | `FULLTEXT ft_text_simple` و`idx_is_banned` موجودين فعلاً في v3 |

### مشاكل لازم نتعامل معاها
1. ✅ **(تم الإصلاح) `categories.title` كان متشفر غلط (Mojibake).** النص متخزن زي `Ø§Ù„Ø¯Ø¹Ø§Ø¡` بدل `الدعاء`. اتأكدت إن إصلاحه ممكن (تحويل cp1252 → utf8)، وجربته على عينة طلعت صح (مثلاً `الدعاء من القرأن و الاستجابه`). اتصلح عبر `fix_categories_titles.sql` والأصل محفوظ في `title_raw` (انظر قسم 4.2).
2. **الـ FULLTEXT اللي في الـ spec مش كفاية للبحث اللي إنت عايزه**، لأن:
   - InnoDB بيتجاهل الكلمات الأقصر من 3 حروف افتراضياً (`innodb_ft_min_token_size=3`) → "من"، "لا"، "ما"، "في"، "هو"، "ان" كلها بتروح، وآيات كتير مبنية عليها ("لا إله إلا هو").
   - ملوش أي تسامح مع الأخطاء (fuzzy) ولا بيفهم الهمزات (`أحد`/`احد`/`إحد`) لأن `text_simple` مش مطبّع.
   - مفيش تصحيح "هل تقصد؟" ولا ترتيب ذكي.
   ← **القرار:** الـ FULLTEXT يفضل كـ fallback بس. البحث الأساسي في **محرك in-memory جوه NestJS** (قسم 5).
3. **الحديث مش موجود في الداتا بيز.** الملفين فيهم قرآن وتفسير فقط، مفيش جدول `hadiths`. بما إنك قلت "قرآن وأحاديث"، الخطة بتصمم المحرك **Generic** عشان الحديث يتضاف بعدين من غير إعادة بناء (قسم 5.9). محتاج أعرف: الحديث في النسخة الأولى ولا لاحقاً؟
4. **التفاسير: عملياً مصدر حقيقي واحد (القرطبي).** أسماء الكتب 2 و3 و4 ("غير متوفر لهذه الآية"، "مصدر إضافي يُحدَّد لاحقاً"...) شكلها placeholders، وكتاب 2 و4 فيهم 6236 صف لكل واحد — **لسه ما فتحتش محتواهم** وهتأكد منه في Phase 0. ميزة "مقارنة التفاسير" هتفضل بدون قيمة لحد ما يتضاف تفسير تاني حقيقي. الـ UI يفلتر الكتب الـ placeholder.
5. **الـ spec بيقول Next.js API Routes + Prisma، وإنت دلوقتي قلت NestJS.** الخطة دي بتفترض: **NestJS = الـ API والبحث، Next.js = الفرونت فقط** (من غير `app/api`). لو عايز Next.js بس من غير NestJS قولي وأعدّل.

---

## 1. القرارات المعمارية

| القرار | الاختيار | السبب |
|---|---|---|
| الباك إند | NestJS (TypeScript) | حسب طلبك، وبيناسب تقسيم الـ modules |
| الفرونت | Next.js App Router + Tailwind + Zustand | حسب الـ spec |
| الـ DB | MySQL 8 (كما هي) | مفيش داعي نغيّر؛ 6236 آية صغيرة جداً |
| ORM | Prisma (`prisma db pull` من الـ dump) | حسب الـ spec، يشتغل في NestJS عادي |
| البحث | **محرك in-memory مخصص في NestJS** + MySQL كمصدر الحقيقة | حجم الداتا صغير، وبنتحكم 100% في التطبيع والتصحيح |
| بيانات المستخدم | localStorage فقط (من غير حسابات) | حسب الـ spec |
| الأدمن | Auth.js أو JWT في NestJS (`@nestjs/jwt` + bcrypt) | استثناء وحيد للـ no-auth |

> **ليه in-memory مش Elasticsearch؟** نص القرآن كله (`text_simple`) حوالي 1-2 ميجا نص، ومفردات فريدة بعد التطبيع بالآلاف قليلة. تحميله في الرام وقت التشغيل = بحث بالـ millisecond، من غير سيرفر إضافي ولا تكلفة. لو الحديث اتضاف وكبر الحجم جداً، ننقل لـ Meilisearch/Typesense (قسم 5.9).

---

## 2. هيكلة المشروع (Monorepo)

```
quran_app/                           # جذر الـ monorepo (npm workspaces + git)
├── apps/
│   ├── backend/                     # NestJS
│   │   └── src/
│   │       ├── prisma/              # PrismaService
│   │       ├── quran/               # suras, ayahs, topics, tafsir controllers
│   │       ├── search/
│   │       │   ├── search.module.ts
│   │       │   ├── search.controller.ts        # GET /search, /search/suggest
│   │       │   ├── search.service.ts           # orchestration + ranking
│   │       │   ├── index/
│   │       │   │   ├── corpus-loader.service.ts   # يحمّل من MySQL عند الإقلاع
│   │       │   │   ├── inverted-index.ts
│   │       │   │   └── vocabulary.ts              # كلمات فريدة + trigram + phonetic
│   │       │   ├── text/
│   │       │   │   ├── normalize.ts               # دالة التطبيع الوحيدة
│   │       │   │   ├── phonetic.ts                # مفاتيح صوتية
│   │       │   │   └── edit-distance.ts           # Damerau-Levenshtein
│   │       │   ├── query/
│   │       │   │   ├── query-parser.ts            # مراجع 2:255 / اسم سورة
│   │       │   │   └── token-corrector.ts         # تصحيح/دمج/تقسيم
│   │       │   └── __tests__/golden-queries.spec.ts
│   │       ├── export/              # PDF (puppeteer)
│   │       └── admin/               # CRUD + auth
│   └── frontend/                    # Next.js (الصفحات من الـ spec قسم 2، من غير app/api)
├── packages/
│   └── text-utils/                  # normalize.ts مشتركة بين backend و frontend (مهم!)
├── scripts/
│   ├── fix-categories-encoding.py
│   ├── verify-db.ts                 # فحص read-only للداتا بيز (npm run verify:db)
│   └── seed-admin.ts
└── claude.md
```

> **`packages/text-utils`:** دالة `normalize` لازم تكون **نفس الكود بالظبط** في الباك والفرونت (الفرونت بيستخدمها في الـ highlight). نسختين = bugs صعبة.

---

## 3. الـ API (مختصر)

| Method | المسار | الوصف |
|---|---|---|
| GET | `/suras`, `/suras/:number` | السور وآياتها |
| GET | `/topics`, `/topics/:id` | المواضيع (`is_banned=0`)، شجرة عبر `parent_id` |
| GET | `/tafsir-books`, `/tafsirs?ayah_id=&book_ids=` | التفاسير (يفلتر placeholders) |
| GET | **`/search`** | البحث الرئيسي (قسم 5.7) |
| GET | **`/search/suggest`** | اقتراحات أثناء الكتابة / "هل تقصد" |
| POST | `/export/pdf` | تصدير السلة |
| POST | `/admin/auth/login` + `/admin/*` | محمي بـ JWT |
| POST | `/admin/search/reindex` | إعادة بناء الفهرس بعد تعديل أدمن |

CORS: يسمح بدومين الفرونت فقط. Rate limiting على `/search` (`@nestjs/throttler`) لأنه أغلى endpoint.

---

## 4. قاعدة البيانات

### 4.1 Migration جديدة `quran-new-v4.sql` (إضافات فقط، من غير حذف)

```sql
-- نسخة مطبّعة جاهزة للبحث (تتملي من سكربت، مش يدوي)
ALTER TABLE `ayahs`
  ADD COLUMN `text_search`   text COLLATE utf8mb4_unicode_ci NULL AFTER `text_simple`,
  ADD COLUMN `text_phonetic` text COLLATE utf8mb4_unicode_ci NULL AFTER `text_search`;

-- قاموس المفردات الفريدة (للتصحيح و"هل تقصد")
CREATE TABLE `search_vocab` (
  `id`        int UNSIGNED NOT NULL AUTO_INCREMENT,
  `word`      varchar(60)  COLLATE utf8mb4_unicode_ci NOT NULL,  -- مطبّع
  `phonetic`  varchar(60)  COLLATE utf8mb4_unicode_ci NOT NULL,
  `skeleton`  varchar(60)  COLLATE utf8mb4_unicode_ci NOT NULL,  -- هيكل صوامت
  `freq`      int UNSIGNED NOT NULL DEFAULT 0,                   -- كام آية فيها الكلمة
  `sample`    varchar(60)  COLLATE utf8mb4_unicode_ci NULL,      -- شكل مشكّل للعرض
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_word` (`word`),
  KEY `idx_phonetic` (`phonetic`),
  KEY `idx_skeleton` (`skeleton`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ملحوظة: عمود categories.title_raw اتضاف فعلاً عند إصلاح العناوين (fix_categories_titles.sql)
```

> الأعمدة دي **اختيارية وظيفياً** (المحرك in-memory بيحسبها وقت الإقلاع)، لكن تخزينها بيدّيك: debugging بـ SQL، وإمكانية fallback، وتتوريث نفس الشكل للحديث.

### 4.2 إصلاح عناوين المواضيع (Mojibake)

> ✅ **الحالة: تم التنفيذ.** اتصلح 175 صف من 183 (الباقي كان سليم أصلاً)، والعمود `title_raw` موجود. الشرح تحت للتوثيق فقط، ومش محتاج تشغيل تاني.

الـ script `scripts/fix-categories-encoding.py`. الفكرة: كل حرف في النص الحالي هو في الأصل **بايت** من UTF-8 اتفسّر غلط كـ cp1252. نرجّعه بايتات ونفك UTF-8.

```python
CP1252_REV = {ord(bytes([b]).decode('cp1252', errors='ignore') or chr(b)): b
              for b in range(128, 256)
              if b not in (0x81, 0x8D, 0x8F, 0x90, 0x9D)}

def fix(s: str) -> str:
    try:
        raw = bytes(CP1252_REV.get(ord(c), ord(c)) if ord(c) > 127 else ord(c) for c in s)
        return raw.decode('utf-8')
    except (UnicodeDecodeError, ValueError):
        return s   # لو مش mojibake أو فشل، سيبه زي ما هو
```

الخطوات: (1) `UPDATE categories SET title_raw = title` (2) شغّل السكربت وحدّث `title` (و`description` لو اتملت) (3) **راجع يدوياً** كل الـ 183 عنوان: لازم كلهم يتقروا عربي، وأي واحد فشل يتعالج لوحده (في الاختبار الأولي صف 5 فشل في cp1252 الصارم بسبب بايت `0x81`، وده اللي بيعالجه الـ mapping الاحتياطي فوق).

### 4.3 ملاحظات Prisma
- `tafsirs.book_id` نوعه `tinyint UNSIGNED` و`tafsir_books.id` نفس الشيء — Prisma هيحوله `Int`، عادي.
- `tafsir_books.id = 0` موجود فعلاً؛ MySQL مع `NO_AUTO_VALUE_ON_ZERO` ماشي، بس انتبه وقت الـ import.
- `tafsirs.content` `mediumtext` والجدول كبير (حوالي 76MB للملف كله): **ماتجيبش `content` في أي list query**، ولا في الـ search. بس في `/tafsirs?ayah_id=`.

---

## 5. محرك البحث (قلب المشروع)

### 5.1 المبدأ
البحث الجيد في نص ديني = **3 حاجات مع بعض**: (أ) تطبيع صارم، (ب) تسامح مع الأخطاء، (ج) **حذر من التصحيح الزايد**.

> ⚠️ **أهم قاعدة:** في القرآن كلمتين بيفرقوا حرف واحد ومعناهم مختلف جداً (`الضالين`/`الظالين`، `يعلمون`/`يعملون`، `قدير`/`قدّر`). لو صححنا بعنف هنخرّب المعنى.
> **لذلك: لو الكلمة موجودة في القاموس كما هي → ما نغيّرهاش أبداً.** التصحيح التلقائي بس للكلمات اللي مش موجودة في القاموس أو لما النتايج صفر. وغير كده نعرض "هل تقصد…؟" كاقتراح وإحنا مش بنفرضه.

### 5.2 التطبيع (Normalization) — دالة واحدة مشتركة

بتتطبق على: `text_simple` وقت الفهرسة، وعلى استعلام المستخدم، وعلى نواتج الـ STT. **بنفس الكود بالظبط.**

```ts
// packages/text-utils/src/normalize.ts
const DIACRITICS = /[\u064B-\u065F\u0670\u06D6-\u06ED\u08D3-\u08FF]/g; // تشكيل + ألف خنجرية + علامات وقف مصحف
const TATWEEL    = /\u0640/g;
const AR_DIGITS  = /[\u0660-\u0669]/g;       // ٠-٩
const FA_DIGITS  = /[\u06F0-\u06F9]/g;       // ۰-۹

export function normalize(input: string): string {
  let s = input.normalize('NFKC');           // يفك أشكال العرض (ﷲ → الله ...)
  s = s.replace(DIACRITICS, '').replace(TATWEEL, '');

  s = s
    .replace(/[\u0623\u0625\u0622\u0671]/g, 'ا') // أ إ آ ٱ → ا
    .replace(/\u0624/g, 'و')                      // ؤ → و
    .replace(/\u0626/g, 'ي')                      // ئ → ي
    .replace(/\u0621/g, '')                       // ء → (حذف)
    .replace(/\u0649/g, 'ي')                      // ى → ي
    .replace(/\u0629/g, 'ه')                      // ة → ه
    .replace(/\u06A9/g, 'ك').replace(/\u06CC/g, 'ي'); // ک ی (كيبورد فارسي)

  s = s
    .replace(AR_DIGITS, d => String(d.charCodeAt(0) - 0x0660))
    .replace(FA_DIGITS, d => String(d.charCodeAt(0) - 0x06F0));

  s = s.replace(/[^\u0621-\u064A0-9\s]/g, ' ');  // شيل أي رموز/ترقيم/لاتيني
  s = s.replace(/(.)\1{2,}/g, '$1$1');            // تكرار 3+ → 2 (مش 1، عشان "الله")
  return s.replace(/\s+/g, ' ').trim();
}
```

**نقاط مقصودة:**
- `ء` بتتحذف (مش بتتحول لألف) → `مسئول`/`مسؤول`/`مسول` كلهم بيتطابقوا، و`شيء`/`شي` كذلك.
  > ⚠️ **تصحيح (Step 6):** بالكود ده `مسئول`→`مسيول` و`مسؤول`→`مسوول` و`مسول`→`مسول`، يعني **مش** بيتطابقوا (`ئ`→`ي` و`ؤ`→`و` بيتعملوا قبل حذف `ء`). `شيء`/`شي` بيتطابقوا. محتاج قرار (انظر 11.6).
- `ة→ه` و`ى→ي` تطبيع **بحث** بس. العرض دايماً من `text_uthmani`.
- **ممنوع** حذف stopwords. آيات كتير كلها stopwords ("لا إله إلا هو"). بدالها بنستخدم **IDF** في الترتيب.
- الألف الخنجرية `ٰ` بتتحذف: `ٱلرَّحْمَٰنِ` → `الرحمن` ✓ (وده كمان بيغطي اللي يكتب "الرحمان" عن طريق قاعدة الـ phonetic تحت).

### 5.3 المفاتيح الصوتية (للبحث الصوتي والأخطاء السمعية)

مستويين فوق التطبيع، **كل واحد بيوسّع التسامح أكتر**:

**المستوى 1 — `phonetic`**: دمج الحروف اللي الـ STT واللهجات بتخلطها.
```ts
const GROUPS: [string, string][] = [
  ['س', 'صث'],   // س ص ث
  ['ز', 'ذظ'],   // ز ذ ظ
  ['د', 'ض'],
  ['ت', 'ط'],
  ['ك', 'ق'],    // ق/ك (واللهجة: ق → ء/ا)
  ['ه', 'ح'],
  ['ا', 'ع'],    // ع/ا
];
export function phonetic(normalized: string): string {
  let s = normalized;
  for (const [to, froms] of GROUPS) s = s.replace(new RegExp(`[${froms}]`, 'g'), to);
  // ألف وسط الكلمة اختيارية: الرحمان/الرحمن، الصلاة/الصلوة (الواو عنصر مد قديم)
  s = s.replace(/(?<=.)[اوي](?=.)/g, (m) => m); // نحتفظ بيها هنا، والمستوى 2 بيشيلها
  return s;
}
```

**المستوى 2 — `skeleton`** (هيكل الصوامت): نشيل حروف المد `ا و ي` من وسط وآخر الكلمة بعد الـ phonetic. بيلم: `الرحمن/الرحمان`، `الصلاة/الصلوة/الصلاه`، `الربا/الربوا`، `ذلك/ذالك`.
> **بيستخدم كآخر خيار فقط**، لأنه بيدمج كلمات كتير مختلفة. وبياخد وزن قليل في الترتيب.

### 5.4 الفهرس (يتبني عند الإقلاع من MySQL)

```
CorpusLoader: SELECT id, sura_number, ayah_number, text_uthmani, text_simple FROM ayahs
 ├─ docs[id]         = { suraNumber, ayahNumber, uthmani, normTokens[] }
 ├─ inverted[word]   = [{ docId, positions[] }]       ← للبحث الدقيق والعبارات
 ├─ vocab[word]      = { freq, idf, phonetic, skeleton, sample }
 ├─ byPhonetic[key]  = Set<word>
 ├─ bySkeleton[key]  = Set<word>
 └─ trigrams[tri]    = Set<word>                       ← لتوليد مرشحين للتصحيح بسرعة
```
حجمه في الرام: عشرات الميجا على الأكتر. وقت البناء: ثواني. بيتبني مرة عند `onModuleInit` وبيتعاد عند `/admin/search/reindex`.

### 5.5 تصحيح الكلمة (Token Corrector)

لكل كلمة في الاستعلام بعد التطبيع، بالترتيب:

1. **موجودة في القاموس؟** → خلاص، نستخدمها كما هي (قاعدة 5.1).
2. **Prefix** (لو آخر كلمة والمستخدم لسه بيكتب أو بدأ صوتياً) → كل الكلمات اللي تبدأ بيها.
3. **Phonetic match**: كلمات القاموس بنفس `phonetic` key.
4. **Edit distance (Damerau-Levenshtein)** على مرشحين من الـ trigram index:
   - طول ≤ 3 → **مفيش fuzzy** (خطر تطابقات عشوائية)
   - طول 4–5 → مسافة ≤ 1
   - طول ≥ 6 → مسافة ≤ 2
   - الـ Damerau مهم لأنه بيعتبر **تبديل حرفين متجاورين** (`الرحمن`↔`الرحنم`) غلطة واحدة.
   - **أخطاء لوحة المفاتيح العربية:** تكلفة استبدال أقل للحروف المتجاورة على الكيبورد (`ض/ص`، `ي/ب/س`، `ت/ن`) بدل تكلفة 1 ثابتة.
5. **Skeleton match** (آخر خيار، وزن أقل).
6. **دمج وتقسيم** (مهم جداً للصوتي):
   - **دمج:** كلمتين متجاورتين لو اتجمعوا بقوا كلمة في القاموس (`ال رحمن` → `الرحمن`، `ان شاء الله`).
   - **تقسيم:** كلمة مش موجودة تتجرب مقسومة عند كل موضع لكلمتين كلهم في القاموس (`قلهوالله` → `قل هو الله`)، وتتجرب كمان بحذف `ال`/`و`/`ف`/`ب`/`ل` الأول.

كل تصحيح بيرجع: `{ original, candidate, kind, cost }`، وكل مرشح بيتصنف بـ: `cost` الأقل أولاً، ثم `freq` الأعلى، ثم تفضيل نفس الطول.

### 5.6 الاسترجاع والترتيب (Ranking)

الاستعلام بيمر على **مراحل متدرجة**، ونوقف لما نجمع نتايج كفاية (≥ 10 مثلاً) من مرحلة قوية:

| المرحلة | الشرط | `matchType` | الوزن |
|---|---|---|---|
| 0 | الاستعلام مرجع `2:255` أو `البقرة 255` أو اسم سورة بس | `reference` | أعلى |
| 1 | **عبارة متصلة** مطبّعة موجودة كما هي في الآية (substring على الكلمات بنفس الترتيب) | `phrase` | 100 |
| 2 | كل الكلمات موجودة بنفس الترتيب بس مش متصلة، (proximity داخل نافذة صغيرة) | `ordered` | 80 |
| 3 | كل الكلمات موجودة بأي ترتيب | `all_terms` | 60 |
| 4 | **نفس الحاجات لكن بعد التصحيح** (fuzzy/phonetic) | `corrected` | 40 |
| 5 | تطابق جزئي: ≥ 60% من كلمات الاستعلام (للتلاوة الناقصة/الصوتي) | `partial` | 25 |
| 6 | skeleton / MySQL FULLTEXT fallback | `loose` | 10 |

**معادلة الدرجة داخل نفس المرحلة:**
```
score = stageWeight
      + Σ idf(term) * matchQuality(term)       // exact=1.0, phonetic=0.85, edit1=0.75, edit2=0.6, skeleton=0.4
      + proximityBonus                          // الكلمات جنب بعض وبنفس الترتيب
      + coverage * 20                           // نسبة كلمات الاستعلام اللي اتلاقت
      - lengthPenalty                           // آية طويلة جداً قدام استعلام قصير بتخسر شوية
```
**الـ IDF** هو اللي بيحل مشكلة الـ stopwords: `الله` و`من` كلمات شائعة فوزنها واطي، و`الرحمن` أو `أصحاب` أعلى.

### 5.7 شكل الـ API للبحث

`GET /search?q=...&type=text|voice&page=1&limit=20`
`type=voice` بيغيّر: عتبات تسامح أوسع، ويفعّل الدمج/التقسيم بقوة، ويقبل `alts` (بدائل الـ STT).

```jsonc
{
  "query": { "raw": "الحمد لله رب العالمن", "normalized": "الحمد لله رب العالمن" },
  "corrected": {
    "applied": true,
    "text": "الحمد لله رب العالمين",           // اللي اتبحث بيه فعلاً
    "changes": [{ "from": "العالمن", "to": "العالمين", "kind": "edit1" }]
  },
  "didYouMean": null,                          // أو ["..."] اقتراحات لو ما طبّقناش تصحيح
  "total": 3,
  "results": [{
    "ayahId": 2, "suraNumber": 1, "suraName": "الفاتحة", "ayahNumber": 2,
    "textUthmani": "ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَٰلَمِينَ",
    "matchType": "phrase", "score": 143.2, "confidence": "high",
    "highlights": [{ "start": 0, "end": 5 }]   // مواضع على textUthmani (مش النص المطبّع!)
  }]
}
```

**`confidence`:** `high` (phrase/ordered، من غير تصحيح) / `medium` (بعد تصحيح خفيف) / `low` (partial/loose). الفرونت بيستخدمها: لو `low` بيعرض أفضل 3 اقتراحات بدل ما يعرض نتيجة كأنها مؤكدة.

### 5.8 الـ Highlight (تحدي خفي)
المطابقة بتحصل على النص **المطبّع** لكن العرض على `text_uthmani` (فيه تشكيل وتطبيع مختلف الطول). الحل:
- وقت الفهرسة نبني لكل آية **خريطة كلمات**: `wordIndex → [startChar, endChar]` في `text_uthmani`، بنقسم الاثنين على المسافات (عدد الكلمات في الاتنين متساوي، وهنتأكد من ده بـ test على الـ 6236 آية).
- المحرك يرجع `wordIndexes` المتطابقة، والـ API يترجمها لمواضع حروف. الفرونت بس يظلل.
- **Test إلزامي:** لكل آية، `uthmani.split(' ').length === simple.split(' ').length`. لو في استثناءات (كلمات مقسومة مختلف) تتسجل في ملف معروف ويتعالج.
  > ⚠️ **نتيجة الفحص (Step 8):** الفرضية مش صح في **364 آية** (أغلبها `يا أيها` ↔ `يَٰٓأَيُّهَا`). التفاصيل والحل المقترح في 11.6 و11.8.

### 5.9 تهيئة المحرك للحديث لاحقاً
المحرك يشتغل على واجهة عامة:
```ts
interface SearchableDoc { type: 'ayah' | 'hadith'; id: number; displayText: string; searchText: string; meta: object }
```
- **جدول حديث مقترح:** `hadiths(id, collection_id, number, text_display, text_search, grade, narrator…)` + `hadith_collections`.
- نفس `normalize` ونفس القاموس **لكن قاموس منفصل لكل نوع** (مفردات الحديث غير القرآن)، والبحث `scope=quran|hadith|all`.
- **حد الانتقال:** لو الحديث عدى ~50-100 ألف نص أو الرام بقى مشكلة → ننقل التخزين/الاسترجاع لـ Meilisearch أو Typesense، ونسيب طبقة التطبيع والتصحيح عندنا قدامه.
- ⚠️ الحديث محتاج **ضبط خاص**: درجة الصحة تظهر مع كل نتيجة، والتشكيل غالباً ناقص أو مختلف، وبعض النصوص مروية بالمعنى — هنحتاج نعرف مصدر بياناتك قبل ما نحدد أكتر.

### 5.10 البحث الصوتي (Voice) — تفاصيل
- **الالتقاط:** Web Speech API (`ar-SA` أو `ar-EG` حسب اللهجة، جرّب الاتنين) مع `interimResults=true` و`maxAlternatives=5`. Safari/iOS ضعيف ← **Plan B: تسجيل صوت وإرساله لـ Whisper/خدمة STT** كإضافة لاحقة (endpoint `/search/voice` ياخد audio).
- **بدائل STT:** نبعت كل الـ `alternatives` في `alts=`، المحرك يبحث بكل واحد ويجمع النتايج ويرتبها بأعلى درجة (نسبة ثقة الـ STT كعامل إضافي).
- **STT بيكتب بالنطق مش بالرسم:** (`الرحمان`، `الله` مكتوبة `اللّه`، أرقام مكتوبة حروف…) ← الـ normalize + skeleton بيغطوا ده.
- **STT ممكن يرجع لهجة مصرية:** ممكن نضيف جدول استبدالات بسيط (`دي`→`هذه`… مش مطلوب في v1، نقيس الأول).
- **التلاوة الجزئية:** المستخدم بيقرا بداية آية. مرحلة `partial` + `prefix` على آخر كلمة بتجيب الآية الصح.
- **UX:** الفرونت يعرض **النص اللي فهمه الـ STT** قدام المستخدم ويسمح له يعدّله قبل/بعد البحث، ويعرض أفضل 3 اقتراحات بدل نتيجة وحيدة لو `confidence=low`.

### 5.11 الأداء
- بحث عادي: الهدف < 30ms على السيرفر (كله في الرام).
- Cache صغير (LRU) على `normalizedQuery+type` (دقايق).
- `/search/suggest`: debounce 200ms في الفرونت، ويرجع أول 5 كلمات من القاموس بالـ prefix/fuzzy + عبارات شائعة، من غير ما يمر على الترتيب الكامل.
- الإقلاع: بناء الفهرس يتم مرة ويتعمل `health` flag `searchReady`، والـ `/search` يرجع 503 قبلها.

### 5.12 الاختبار والقياس (مهم جداً — مفيش بحث جيد من غير ده)
**ملف `golden-queries.json`**: 150-300 حالة، كل حالة `{ q, type, expectedAyahIds[] }`، تتقسم:
| الفئة | أمثلة للتجربة |
|---|---|
| تشكيل/همزات | `إياك نعبد`، `اياك نعبد`، `أياك نعبد` |
| تاء/هاء، ياء/ألف مقصورة | `الصلاه`، `الدنيا`/`الدنيى`، `رحمة`/`رحمه` |
| رسم عثماني | `الصلوة`، `الزكوة`، `الربوا` |
| حرف ناقص/زايد/مبدل | `الرحمن الرحيم` بأخطاء: `الرحمن الرحم`، `الرحمم`، `الرحنم` |
| ض/ظ، س/ص/ث، ذ/ز، ت/ط، ق/ك | `الضالين` مكتوبة `الظالين` (**لازم يعرض الاتنين، مش يستبدل**) |
| كلمات ملزوقة/مفرقة (STT) | `قلهوالله احد`، `ال رحمن` |
| تلاوة جزئية | أول 3 كلمات من 20 آية عشوائية |
| مراجع | `2:255`، `البقرة 255`، `سورة الكهف` |
| stopwords فقط | `لا اله الا هو` |
| سلبيات | كلام مش من القرآن → لازم `confidence=low` أو لا نتائج، **مش** نتيجة واثقة غلط |

**المقاييس:** Recall@1، Recall@5، MRR، ونسبة **التصحيح الغلط** (اللي غيّر كلمة صح لغلط). بتتشغل في CI، ولو اتحسّنت حاجة وبوّظت حاجة نشوفها فوراً. **نبدأ بالـ golden set قبل ما نظبط الأوزان**، مش بعدين.

---

## 6. الفرونت (Next.js) — الجزء المتعلق بالبحث

- **`/search`**: input مع debounce، زرار مايك (`VoiceSearchButton`)، فلتر النطاق (`قرآن | حديث | الكل` — الحديث معطّل في v1)، pagination.
- **عرض التصحيح:** شريط "تم البحث عن **X** بدلاً من Y — [ابحث عن Y فعلاً]" عند `corrected.applied`، و"هل تقصد: …" عند `didYouMean`.
- **`AyahCard`:** تظليل الكلمات المطابقة، badge لنوع المطابقة (اختياري للأدمن/debug).
- **اقتراحات أثناء الكتابة** من `/search/suggest`.
- **نتيجة STT قابلة للتعديل** قبل البحث.
- RTL كامل، خط يدعم العثماني (Amiri Quran أو KFGQPC) محلي.

---

## 7. باقي الميزات (من الـ spec، بدون تغيير جوهري)

| الميزة | التخزين | ملاحظة |
|---|---|---|
| سلة + تصدير PDF | localStorage `quran_cart` | Puppeteer في NestJS؛ خط عربي محلي مضمّن |
| إعدادات القراءة (خط/ليلي) | `quran_settings` | Zustand persist |
| الورد/الختمة | `quran_khatma` | حسابات client-side، 6236 آية |
| مشاركة كصورة | — | `html-to-image`، تأكد من تحميل الخط قبل `toPng` |
| مقارنة التفاسير | — | تنتظر ≥ 2 مصدر حقيقي (انظر 0.4) |
| Bookmark / آخر صفحة | `quran_bookmark`, `quran_last_route` | |
| لوحة الأدمن | جدول `admins` | بعد أي تعديل نص آية → `reindex` |

**تصحيحات على الـ spec:**
- الـ spec بيقول `AUTH` في Next.js (`next-auth`)؛ مع NestJS الأبسط: JWT في httpOnly cookie + `bcrypt`. لو فضلت Auth.js في Next.js، الـ NestJS لازم يتحقق من نفس الـ JWT.
- `ayahs` مفيهاش عمود للـ `text` التاني بعد التطبيع، ده اللي بيضيفه v4.
- `/api/topics`: لازم `is_banned=0` **في الباك**، مش في الفرونت بس.
- تعديل نص آية من الأدمن لازم يعيد حساب `text_search/text_phonetic` + `reindex`، وإلا البحث هيشتغل على نص قديم.

---

## 8. المراحل (Roadmap)

> **الحالة الفعلية:** Phase 1 (الباك إند) خلص، والفرونت لسه. من Phase 0 اتعمل الـ restore و`db pull` وإصلاح الـ mojibake وفحص الكلمات، لكن كتب التفسير 2/3/4 لسه ما اتأكدتش. التفاصيل في **قسم 11**.

| المرحلة | المحتوى | معيار النجاح |
|---|---|---|
| **0 — تجهيز** | restore الداتا بيز، `prisma db pull`، إصلاح mojibake، فحص كتب التفسير 2/3/4، تأكيد إن عدد كلمات uthmani = simple | عناوين المواضيع بتتقري، تقرير بالاستثناءات |
| **1 — الأساس** | Monorepo، PrismaService، endpoints السور/الآيات/المواضيع/التفاسير، صفحات القراءة | قراءة سورة كاملة من الـ UI |
| **2 — محرك البحث (نواة)** | `normalize` + الفهرس + مراحل 0-3 + highlight + الـ golden set الأولي | Recall@5 ≥ 95% على الحالات النظيفة |
| **3 — التسامح مع الأخطاء** | token corrector (phonetic، edit distance، دمج/تقسيم)، "هل تقصد" | Recall@5 ≥ 90% على الأخطاء، والتصحيح الغلط < 2% |
| **4 — الصوتي** | VoiceSearchButton، alts، `type=voice`، تعديل النص | اختبار على عدة أجهزة ولهجات |
| **5 — ميزات المستخدم** | سلة/PDF، إعدادات، ختمة، bookmark، مشاركة | |
| **6 — الأدمن** | auth، CRUD، reindex | |
| **7 — الحديث** (لو مطلوب) | جداول، import، قاموس منفصل، `scope` | |
| **8 — إنتاج** | rate limiting، caching، monitoring، backup، PWA اختياري | |

---

## 8.5 تنظيف بيانات مطلوب (Phase 0)
- حذف/تفريغ المواضيع التجريبية: `id` 50 و167 و178 (محظورة، أسماء مثل `ddd`).
- تفريغ `description` التجريبي في الصفوف 41 و107 و141 (`bastest`, `er`, `test 2`).
- مراجعة إملاء عناوين المواضيع للعرض (`الصلاه`→`الصلاة`، `الحسني`→`الحسنى`...) يدوياً أو من لوحة الأدمن. البحث مش متأثر لأن التطبيع بيوحّد الصيغتين.

## 9. أسئلة محتاجة قرارك
1. **الحديث:** في النسخة الأولى ولا بعدين؟ ولو في v1، البيانات منين (مصدر + ملف)؟
2. **NestJS + Next.js منفصلين** (زي ما افترضت) ولا Next.js بس؟
3. **الاستضافة:** VPS ولا serverless؟ (بيأثر على Puppeteer، وعلى الـ in-memory index اللي محتاج process شغال ثابت — **مش مناسب لـ serverless**).
4. **اللهجة المستهدفة للصوتي:** مصري، خليجي، ولا فصحى؟ بيأثر على لغة الـ STT والاستبدالات.
5. **مصادر تفسير إضافية** هتتضاف؟ ولا القرطبي بس؟
6. **الـ `ayah_banned`/محتوى محظور:** المواضيع الـ 3 المحظورة — هل تتخبي من البحث والـ API كلياً ولا من القوائم بس؟

---

## 10. ملاحظات أمان وتشغيل سريعة
- كلمة سر الأدمن عبر env + سكربت محلي (حسب الـ spec 8.4)، **ماتتحطش في git**.
- `.env`: `DATABASE_URL`, `JWT_SECRET`, `ADMIN_EMAIL/PASSWORD` (للسكربت بس).
- Backup دوري للـ DB قبل أي migration، خصوصاً إصلاح الـ mojibake (عشان كده `title_raw`).
- اعتبر مدخلات البحث غير موثوقة: حد أقصى للطول (200 حرف) وعدد الكلمات (20)، لأن الـ fuzzy تكلفته بتزيد.
---

## 11. حالة التنفيذ — Backend (Steps 1–8) · آخر تحديث 2026-11-12

> القسم ده بيوصف **اللي اتبنى فعلاً**. لو في تعارض بينه وبين خطة الأقسام اللي فوق، ده هو الواقع الحالي للكود.

### 11.1 اللي اتعمل
| Step | المحتوى | الحالة |
|---|---|---|
| 1 | فحص الداتا بيز read-only (`npm run verify:db`): الأعداد، utf8mb4، عنوان category 1 بيتقارن بالـ code points | ✅ |
| 2 | Monorepo (npm workspaces) + NestJS 11 + ESLint/Prettier/Jest + Joi env validation + `GET /health` | ✅ |
| 3 | Prisma 6.19 (`prisma db pull` + أسماء camelCase عبر `@map`)، `PrismaService`، اختبارات DB اختيارية `test:db` | ✅ |
| 4 | helmet، compression، CORS صارم، request id، access log من غير بيانات حساسة، شكل أخطاء موحّد، حدود الحجم (413/414)، rate limiting (`default`/`auth`/`search`) | ✅ |
| 5 | Endpoints القراءة: السور، المواضيع، كتب التفسير، التفاسير | ✅ |
| 6 | `packages/text-utils` → `normalize()` (نفس كود 5.2 بالظبط، اتأكدنا على 12,681 مدخل) | ✅ |
| 7 | Admin auth: login/logout/me، bcrypt 12، JWT في cookie، guard على `/admin/*`، lockout لكل إيميل، `seed:admin` | ✅ |
| 8 | تحديث الملف ده | ✅ |

**الاختبارات:** backend 331 test (unit + e2e، Prisma mocked)، text-utils 65، واختبارات DB اختيارية read-only (backend 9، text-utils 5). Coverage: 100% lines، ~96% branches.

### 11.2 هيكلة الكود الفعلية
```
quran_app/
├── apps/backend/src/
│   ├── bootstrap/        setup-app.ts (كل الـ Express middleware، مشترك مع الـ e2e)، cors.ts
│   ├── common/           filters/ (AllExceptionsFilter)، http/ (request id، logger، url length)،
│   │                     throttling/ (@RateLimit + AppThrottlerGuard)، validation/، pagination/
│   ├── config/           env.validation.ts (Joi)، origins، trust-proxy، duration
│   ├── prisma/           PrismaService (global)
│   ├── health/           GET /health
│   ├── quran/            ayah.select.ts + suras/ + topics/ + tafsirs/
│   └── admin/            admin.module.ts + auth/
├── apps/frontend/        (فاضي لسه)
├── packages/text-utils/  normalize() — المصدر الوحيد (الباك والفرونت يستوردوا من @quran/text-utils)
└── scripts/              verify-db.ts، seed-admin.ts
```

### 11.3 الـ API الفعلي
| Method | المسار | ملاحظات |
|---|---|---|
| GET | `/health` | `{ status, uptimeSeconds }` |
| GET | `/suras` | `{ data: [{ number, nameAr, nameEn, ayahCount, revelationPlace }] }` |
| GET | `/suras/:number?page=&limit=` | `number` من 1 لـ 114 وإلا 400 → `{ sura, ayahs, pagination }` |
| GET | `/topics?tree=true\|false` | `is_banned=0` فقط، و**أي موضوع تحت أب محظور بيستخبى كمان**. شكل العنصر: `{ id, parentId, title, description }` (+`children` في الشجرة) |
| GET | `/topics/:id?page=&limit=` | 404 واحد للمحظور والمش موجود → `{ topic, ayahs, pagination }` بترتيب المصحف |
| GET | `/tafsir-books` | بيخبي ids `0, 2, 3, 4` (`HIDDEN_TAFSIR_BOOK_IDS`) → حالياً كتاب 1 بس |
| GET | `/tafsirs?ayah_id=&book_ids=1,5` | **المكان الوحيد** اللي بيقرا `tafsirs.content`. 404 لو الآية مش موجودة. الصفوف اللي `content` فيها NULL بتتشال |
| POST | `/admin/auth/login` | `{ email, password }` → 200 `{ admin }` + cookie. 401 موحّد. 429 + `Retry-After` |
| POST | `/admin/auth/logout` | 204، بيمسح الـ cookie |
| GET | `/admin/auth/me` | `{ id, email, name, createdAt, lastLoginAt }` أو 401 |

**قواعد عامة متطبقة:**
- **الآية دايماً بالشكل ده:** `id, suraNumber, ayahNumber, textUthmani, textSimple, juz, page`.
- **الصفحات:** الافتراضي 50 والحد الأقصى 100.
- **الأرقام في الـ query/params صارمة:** `1.5` و`1e2` و`-1` والباراميتر المتكرر كلها 400.
- **أي باراميتر مش معروف = 400.**
- **مفيش 500 من مدخلات غلط.**
- **الحقول الداخلية مش بتتقري أصلاً:** `legacy_uuid` و`title_raw` و`is_banned` مش بيتعملهم select.
- **شكل الخطأ:** `{ statusCode, error, message, details?, requestId, path, timestamp }`.

### 11.4 متغيرات البيئة (`apps/backend/.env` — في `.gitignore`، والقالب في `.env.example`)
| المتغير | مطلوب؟ | الافتراضي | ملاحظة |
|---|---|---|---|
| `DATABASE_URL` | ✅ | — | `mysql://...` |
| `WEB_ORIGIN` | ✅ | — | origins مفصولة بفاصلة (CORS) |
| `JWT_SECRET` | ✅ | — | ≥ 32 حرف |
| `JWT_EXPIRES_IN` | | `8h` | من `5m` لـ `7d` |
| `NODE_ENV` | | `development` | `production` بيفعّل `Secure` على الـ cookie وبيخبي رسائل أخطاء الـ 500 |
| `PORT` | | `3001` | |
| `TRUST_PROXY` | | `false` | في الإنتاج ورا proxy واحد: `1` |
| `BODY_LIMIT` / `MAX_URL_LENGTH` | | `100kb` / `8192` | الـ 8192 عشان `alts` بتاع البحث الصوتي |
| `THROTTLE_{DEFAULT,AUTH,SEARCH}_{LIMIT,TTL_SECONDS}` | | 100/60، 5/60، 30/60 | لكل IP |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | | — | لـ `npm run seed:admin` **بس**، والـ API مش بيقراهم |

### 11.5 الأوامر (من جذر `quran_app/`)
| الأمر | بيعمل إيه |
|---|---|
| `npm run build` / `npm run lint` / `npm test` | الـ workspaces كلها (`lint` بيعمل كمان typecheck للـ scripts) |
| `npm run test:db -w @quran/backend` و `-w @quran/text-utils` | اختبارات read-only على الداتا بيز الحقيقية |
| `npm run verify:db` | فحص الداتا بيز (read-only) |
| `ADMIN_EMAIL=… ADMIN_PASSWORD='…' npm run seed:admin` | INSERT بس. لو الإيميل موجود مش بيغيّر حاجة |
| `cd apps/backend && npm run start:dev` | تشغيل السيرفر محلياً |

### 11.6 انحرافات عن الخطة وقرارات اتاخدت
1. **مكان `normalize`:** `packages/text-utils` هو المصدر الوحيد. محرك البحث يستورده بدل `search/text/normalize.ts` اللي في قسم 2.
2. **ملاحظات على 5.2، والكود اتنفذ زي ما هو:**
   - (أ) `مسئول` و`مسؤول` و`مسول` **مش** بيتطابقوا (بيبقوا مسيول ومسوول ومسول). اقرأ الملاحظة في 5.2.
   - (ب) قاعدة "تكرار 3+ → 2" بتشتغل على الأرقام كمان (`1000` → `100`)، فمراجع زي `2:255` لازم تتقري من النص الخام.
   - (ج) تطبيع العثماني ≠ تطبيع البسيط (`العلمين` / `العالمين`)، والفهرسة على `text_simple`.
3. **فرضية 5.8 غلط:** عدد الكلمات في `text_uthmani` و`text_simple` **مختلف في 364 آية**:
   - 359 آية بفرق كلمة واحدة، منهم 344 فيها `يا` منفصلة: `يَٰٓأَيُّهَا` كلمة واحدة في العثماني قصاد `يا أيها` كلمتين في البسيط.
   - 4 آيات بفرق كلمتين: 11:44 و20:94 و28:38 و37:102.
   - 97:1 بفرق +4.
   - **الـ highlight محتاج alignment** مش split بسيط (انظر 11.8).
4. **المواضيع:** `is_banned` بيتفلتر في الباك. أي موضوع جوه شجرة أب محظور بيستخبى كمان (حالياً المحظورين 50 و167 و178 ملهمش أبناء). البند 6 في قسم 9 لسه مفتوح بالنسبة **للبحث**.
5. **التفاسير:** الكتب 0 و2 و3 و4 مستخبية لحد ما تتأكد. الصفوف اللي `content` فيها NULL مش بترجع (كتاب 1 فيه 6 منهم، وكتاب 2 فيه 1، وكتاب 3 كله، وكتاب 4 فيه 36).
   **فحص read-only بتاريخ 2026-11-12:**
   - **كتاب 0:** صفر صفوف، placeholder فعلاً.
   - **كتاب 3:** 12 صف وكلهم NULL، يعني فاضي.
   - **كتاب 2:** اسمه placeholder ("غير متوفر لهذه الآية") لكن **محتواه تفسير حقيقي مختصر**. 6236 صف، متوسط 176 حرف، والأسلوب `{ الآية } شرح` شكله تفسير الجلالين (لسه محتاج تأكيد). علامات التنصيص متكررة `""` (أثر من الـ import).
   - **كتاب 4:** اسمه placeholder لكن **محتواه تفسير حقيقي مطوّل**. متوسط 2623 حرف، والأسلوب شكله ابن كثير (غالباً مختصر). فيه 1902 نص مختلف بس لـ 6236 آية، يعني نفس الشرح متكرر لكل آيات المقطع الواحد، والـ UI لازم يدمج المتكرر.
   - إظهار كتاب 2 أو 4 محتاج: تأكيد المصدر + اسم ومؤلف صح. تعديل `tafsir_books` ممنوع حالياً، فيا إما إذن بالـ UPDATE يا إما override للاسم في الكود.
6. **الأدمن:**
   - JWT في NestJS (مش Auth.js). الـ cookie اسمها `qa_admin_session`، و`HttpOnly`، و`SameSite=Lax`، و`Path=/admin`، و`Secure` في الإنتاج.
   - ⚠️ **لازم الفرونت والـ API يكونوا على نفس الـ site** (زي `app.example.com` و`api.example.com`)، وإلا الـ cookie مش هتتبعت.
   - الـ logout بيمسح الـ cookie بس، والـ token المنسوخ بيفضل صالح لحد ما يخلص (مفيش revocation).
   - الـ lockout: 5 محاولات غلط في 15 دقيقة → 429 لمدة 15 دقيقة، بيتخزن in-memory ورا interface `LockoutStore` (جاهز لـ Redis).
7. **إصدارات:**
   - Prisma 6.19، لأن 7.x ESM-first ومحتاج driver adapter.
   - `@nestjs/jwt` 11.0.2، لأن 12.x ESM-only ومش شغال مع Jest.
   - `bcryptjs` بدل `bcrypt`، لأن npm 11 بيمنع الـ install scripts بتاعة النسخ native.
8. **الداتا بيز:** مفيش أي migration ولا أي UPDATE/DELETE على جداول المحتوى. **migration v4 (4.1) والتنظيف (8.5) ما اتنفذوش.** الكتابة الوحيدة في الكود: `admins.last_login_at`، و`seed:admin` (INSERT).

### 11.7 اللي لسه ما اتعملش
- **محرك البحث بالكامل (قسم 5):**
  - `/search` و`/search/suggest` و`/admin/search/reindex`.
  - الـ health flag `searchReady` + 503 قبل ما يجهز.
  - الـ golden set.
  - الـ throttler `search` جاهز: `@RateLimit('search')`.
- `/export/pdf`، و CRUD الأدمن، والفرونت كله، والحديث.
- **migration v4 (`text_search` و`text_phonetic` و`search_vocab`):** ملء الأعمدة دي محتاج UPDATE على `ayahs`، وده ممنوع حالياً. المحرك in-memory مش محتاجها، فالقرار مؤجل.
- **تنظيف 8.5** (المواضيع التجريبية والأوصاف): محتاج DELETE/UPDATE، يعني إذن صريح.
- **تشغيلي:**
  - أول أدمن لسه ما اتعملوش seed.
  - مفيش token revocation.
  - تخزين الـ lockout والـ throttler in-memory، وده مش مناسب لأكتر من instance (الحل Redis).
- **قرارات اتاخدت (2026-11-12):**
  - `normalize()` **مش هتتغير**. `مسئول`/`مسؤول`/`مسول` بيتعالجوا في الـ corrector (مستوى الـ skeleton) لما الكلمة المكتوبة مش في القاموس.
  - `apps/quran-app-v2-spec*.md` اتعمله ignore.
  - أول commit اتعمل على branch `feat/backend-foundation`.
  - قسم 9 وتنظيف 8.5 متأجلين، **ومفيش أي UPDATE/DELETE**.
- **أسئلة مفتوحة:**
  - تأكيد مصدر كتابي التفسير 2 و4 وأسمائهم (انظر 11.6 بند 5).
  - أسئلة قسم 9.

### 11.8 الخطوة الجاية المقترحة: Phase 2 — نواة محرك البحث
1. **الـ golden set الأول (5.12):** `golden-queries.json` بـ ~50 حالة نضيفة (مراجع، عبارات، همزات، stopwords) + سكربت يحسب Recall@1/Recall@5/MRR.
2. **`CorpusLoader` + الفهرس (5.4):**
   - تحميل `ayahs` مرة واحدة عند الإقلاع (من غير `tafsirs.content`).
   - inverted index بالمواضع + vocab + IDF.
   - `normalize` من `@quran/text-utils`.
3. **محاذاة الكلمات للـ highlight (5.8):** ماب `simpleWordIndex → uthmaniCharRange`، بتتعامل مع الـ 364 آية (يا+أيها ↔ يٰأيها، و97:1)، وعليها test على الـ 6236 آية.
4. **المراحل 0–3 (5.6)** + `GET /search` (DTO: `q` ≤ 200 حرف و ≤ 20 كلمة) + `searchReady`/503.
5. **معيار النجاح:** Recall@5 ≥ 95% على الحالات النضيفة. التصحيح (Phase 3) بعدها.
