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
| GET | `/ayahs?ids=1,2,255` | (Phase 5) لحد 100 id → `{ data: [ayah + suraName] }` بنفس ترتيب الطلب. الـ ids اللي مش موجودة مش بترجع. السلة بتستخدمه |
| POST | `/export/pdf` | (Phase 5) body `{ items: { ayahId; tafsirBookId? }[] }` (1–100) → 200 `application/pdf` attachment `quran-selection.pdf`. 400 لكتاب تفسير مستخبي/مش موجود، 404 لآية مش موجودة، 503 لو مفيش متصفح. throttler `export` (10/دقيقة) |
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
  > ⚠️ **نتيجة الفحص (Step 8):** الفرضية مش صح في **364 آية**. التفاصيل في 11.6.
  > ✅ **(S3) اتحلت:** محاذاة DP عامة بتربط كل كلمة من `text_simple` بمدى حروف (UTF-16) في `text_uthmani`، واتأكدنا منها على الـ 77,797 كلمة كلها. الكود في `apps/backend/src/search/index/alignment.ts`، والحالات الخاصة موثقة في `alignment-exceptions.ts`.

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

> **الحالة الفعلية (2026-11-16):** Phase 1 (الباك إند) و Phase 2 و Phase 3 و Phase 4 (البحث الصوتي، باك + فرونت) وتصدير السلة PDF من Phase 5 خلصوا. الفرونت خلص كمان: صفحات القراءة، والإعدادات، والختمة، والـ bookmark، والمشاركة كصورة (11.15). و Phase 6 (لوحة الأدمن، 11.17) خلصت. الباقي: Phase 7 (الحديث)، و Phase 8 (الإنتاج). من Phase 0 اتعمل الـ restore و`db pull` وإصلاح الـ mojibake وفحص الكلمات، لكن كتب التفسير 2/3/4 لسه ما اتأكدتش. التفاصيل في **قسم 11**.

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
- `.env`: `DATABASE_URL`, `JWT_SECRET`, `ADMIN_EMAIL`/`ADMIN_INITIAL_PASSWORD` (للسكربت بس).
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
| GET | `/search?q=&type=text|voice&alts=&page=&limit=` | (S5 + Phase 3 + Phase 4) شكل 5.7، ومعاه `corrected` و`didYouMean` (11.11). `q` ≤ 200 حرف و ≤ 20 كلمة. `alts` (لـ `type=voice` بس) = بدائل الـ STT مفصولة بـ `|`، لحد 5، وكل واحد بنفس قيود `q` (11.12). 503 قبل ما الفهرس يجهز. throttler `search` (30/دقيقة) |
| GET | `/search/suggest?q=` | (5.11) `{ query, suggestions: [{ text, word, kind }] }`، لحد 5 اقتراحات لآخر كلمة. نفس قيود `q`، وأي باراميتر تاني = 400. throttler `default` بس. 503 قبل الجاهزية |
| POST | `/admin/search/reindex` | محتاج cookie الأدمن (401 من غيرها). بيعيد بناء الفهرس من الداتا بيز (قراءة بس) → 200 + `SearchIndexStatus`. لو فشل → 503 برسالة عامة، والفهرس القديم بيفضل شغال. الـ cache بيتمسح تلقائي |

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
| `THROTTLE_EXPORT_LIMIT` / `THROTTLE_EXPORT_TTL_SECONDS` | | 10 / 60 | لـ `POST /export/pdf` |
| `PDF_BROWSER_PATH` | | (auto) | Chrome/Chromium/Edge لـ puppeteer-core. لو فاضي بيدوّر في المسارات المعتادة |
| `ADMIN_EMAIL` / `ADMIN_INITIAL_PASSWORD` / `ADMIN_NAME` | | `admin@quran.com` / — / `Admin` | لـ `npm run seed:admin` **بس**، والـ API مش بيقراهم. `ADMIN_PASSWORD` القديم **مبقاش بيتقري** (11.17) |
| `TEST_DATABASE_NAME` | | `<db>_test` | لـ `db:test:create` و `test:write-db` بس، ولازم ينتهي بـ `_test` |

### 11.5 الأوامر (من جذر `quran_app/`)
| الأمر | بيعمل إيه |
|---|---|
| `npm run build` / `npm run lint` / `npm test` | الـ workspaces كلها (`lint` بيعمل كمان typecheck للـ scripts) |
| `npm run test:db -w @quran/backend` و `-w @quran/text-utils` | اختبارات read-only على الداتا بيز الحقيقية |
| `npm run verify:db` | فحص الداتا بيز (read-only) |
| `ADMIN_INITIAL_PASSWORD='…' npm run seed:admin` | (11.17) بيعمل `admin@quran.com` / `Admin`. INSERT بس: لو الإيميل موجود مش بيغيّر حاجة (ولا الباسورد) |
| `npm run db:test:create` | (11.17) بيعمل/يعيد `<db>_test` نسخة معزولة من الداتا بيز (قراءة بس من الأصل، و`admins` فاضي) |
| `npm run test:write-db -w @quran/backend` | (11.17) اختبارات الكتابة للأدمن على `<db>_test` بس (بيرفض أي داتا بيز تانية) |
| `cd apps/backend && npm run start:dev` | تشغيل السيرفر محلياً |
| `npm test -w @quran/frontend` | Vitest (منطق الفرونت + الـ stores) |
| `E2E_BASE_URL=… npm run test:e2e -w @quran/frontend` | browser journeys (محتاجة الباك والفرونت شغالين، انظر 11.15) |
| `postman collection run postman/quran-api.postman_collection.json -e postman/local.postman_environment.json` | كل الـ endpoints (144 طلب، منهم 60 للأدمن في فولدر 09) على باك إند شغال. ممكن تستورده في Postman كمان. اختياري: `adminEmail`/`adminPassword` في الـ environment. شغّله مرة كل دقيقة (حدود الـ rate limit) |
| `npm run dev -w @quran/frontend` | الفرونت على `http://localhost:3000` (`NEXT_PUBLIC_API_URL` في `apps/frontend/.env.local`، والقالب `.env.example`) |

### 11.6 انحرافات عن الخطة وقرارات اتاخدت
1. **مكان `normalize`:** `packages/text-utils` هو المصدر الوحيد. محرك البحث يستورده بدل `search/text/normalize.ts` اللي في قسم 2.
2. **ملاحظات على 5.2، والكود اتنفذ زي ما هو:**
   - (أ) `مسئول` و`مسؤول` و`مسول` **مش** بيتطابقوا (بيبقوا مسيول ومسوول ومسول). اقرأ الملاحظة في 5.2.
   - (ب) قاعدة "تكرار 3+ → 2" بتشتغل على الأرقام كمان (`1000` → `100`)، فمراجع زي `2:255` لازم تتقري من النص الخام.
   - (ج) تطبيع العثماني ≠ تطبيع البسيط (`العلمين` / `العالمين`)، والفهرسة على `text_simple`.
3. **فرضية 5.8 غلط:** عدد الكلمات في `text_uthmani` و`text_simple` **مختلف في 364 آية**:
   - **344 آية فيها نداء واحد:** `يا` + الكلمة اللي بعدها كلمتين في البسيط وكلمة واحدة في العثماني. منهم 141 `يا أيها`، والباقي `يا قوم` (38)، `يا موسى` (24)، `يا بني` (19)، وغيرهم.
   - **20 حالة تانية** موثقة واحدة واحدة في `alignment-exceptions.ts`:
     - `ها أنتم` (4 آيات)
     - `ويا` + اسم (10 آيات)
     - ندائين في نفس الآية (11:44 و28:38 و37:102)
     - `يا ابن أم` → كلمة واحدة (20:94)
     - `وأن لو` (72:16)
     - 97:1
   - ⚠️ **ملاحظة بيانات في 97:1:** `text_uthmani` بيبدأ بالبسملة (4 كلمات) و`text_simple` لأ. البيانات ما اتعدلتش (read-only)، والبسملة بتفضل من غير ربط في المحاذاة. لو حابب تتصلح محتاج إذن بالـ UPDATE.
   - **الـ highlight اتحل في S3** بـ alignment (انظر 5.8).
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
- **محرك البحث:** Phase 2 و Phase 3 وبنود 5.11 خلصوا (11.9 → 11.11). الباك إند الصوتي + المرحلة 5 `partial` خلصوا في 11.12. الباقي: FULLTEXT fallback، والعبارات الشائعة في suggest، والفرونت الصوتي.
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

### 11.9 S4 — البحث بالمراجع (المرحلة 0 من 5.6) · 2026-11-16
**الحالة:** اتنفذ ومستني الموافقة. `GET /search` لسه مش متعرض (الـ HTTP layer مرحلة جاية).

**الصيغ المدعومة** (الاستعلام كله لازم يكون مرجع، وإلا بيروح للبحث النصي):
| الصيغة | أمثلة | النتيجة |
|---|---|---|
| رقمي | `2:255`، `٢:٢٥٥`، `۲:۲۵۵`، `2/255`، `(2:255)`، `﴿٢:٢٥٥﴾` | الآية |
| اسم + رقم | `البقرة 255`، `[البقرة: 255]`، `البقرة، 255`، `سورة البقرة آية 255`، `آل عمران ١٩٠` | الآية |
| الآية الأول | `آية 35 من سورة النور`، `الآية 255 البقرة` | الآية |
| `سورة` + رقم | `سورة 18`، `سورة 2 آية 255` | الآية 1 / الآية |
| اسم بس | `الكهف`، `سورة الكهف`، `يس`، `ياسين` | الآية 1 من السورة |

- **الأرقام بتتقري من النص الخام** (مش بعد `normalize`) عشان `يوسف 111` ماتبقاش 11 (انظر 11.6 ب).
- **أسماء السور:** من جدول `suras` (read-only)، بعد `normalize`. فيه كمان: الاسم من غير `ال` (`بقرة 255`)، وأسماء بديلة معروفة (`براءة`، `بني إسرائيل`، `تبارك`، `عم`، `الدهر`، `التوحيد`...) في `SURA_ALIASES`. اللي ممكن يبقى كلمة قرآنية عادية بيشتغل **بس مع `سورة` أو رقم آية** (`use: 'signal'`).
- **غلط:** `2:300`، `البقرة 300`، `115:1`، `سورة 115` → `reference.status = 'invalid'` مع السبب و`ayahCount`، ومفيش نتايج. `255` لوحده مش مرجع.
- **الغموض:** 78 اسم سورة من 114 موجودين كنص في القرآن (`الرحمن` 45 آية، `الناس` 172...). الاسم لوحده → المرجع الأول (`confidence: medium`، `ambiguous: true`) وبعده **كل** نتايج العبارة. ولا نتيجة نصية بتضيع.
- **الكود:** `search/query/sura-catalog.ts`، `search/query/reference-parser.ts`، `search/search.service.ts` (المرحلة 0 + المرحلة 1). الـ snapshot بقى `{ index, alignment, suras }`، والبناء بيفشل لو `suras.ayah_count` مختلف عن الآيات المفهرسة.
- **Golden:** 24 حالة مرجع (كانوا 10) + 8 سلبيات (كانوا 4). المحرك: R@1 = R@5 = MRR = 100% على الـ 68 حالة الإيجابية، وصفر false positives، ونتايج حالات العبارة **مطابقة** للـ baseline.

### 11.10 S5 — المراحل 1–3 + الترتيب + `GET /search` (بند 4 في 11.8) · 2026-11-16
**الحالة:** اتنفذ ومستني الموافقة. ده آخر بند في Phase 2 (11.8).

- **المراحل (5.6):** `reference` (0) ← `phrase` (1) ← `ordered` (2: نفس الترتيب جوه نافذة ≤ 3 × عدد كلمات الاستعلام) ← `all_terms` (3: أي ترتيب، والكلمة المكررة لازم تتكرر). المراحل **عمرها ما بتتداخل**.
- **قاعدة الإيقاف:** لو وصلنا لـ 10 نتايج (`MIN_RESULTS`) بعد أي مرحلة، المراحل الأضعف مش بتشتغل. في عينة 996 استعلام، 5 آيات مصدر ما ظهرتش بسبب القاعدة دي بس (الكلمات المتلخبطة طلعت عبارة شائعة في آيات تانية).
- **الدرجة:** معادلة 5.6 (`weight + Σidf + proximity + coverage·20 − lengthPenalty`)، وجوه المرحلة الواحدة الآية الأقصر والأقرب تطلع الأول، والتعادل بترتيب المصحف. المرجع `200 + Σidf + 30`، يعني دايماً فوق أي نتيجة نصية.
- **`confidence`:** `phrase`/`ordered` = high، `all_terms` = medium، المرجع الغامض = medium.
- **الرد:** شكل 5.7 (`suraName`، `textUthmani`، `score`، `highlights`)، و`corrected`/`didYouMean` = `null` لحد Phase 3. الـ highlights بتتحسب للصفحة المطلوبة بس. `textUthmani` من الـ snapshot (مفيش query على الداتا بيز وقت البحث).
- **Golden:** فئة جديدة `word_order` (12 حالة). الـ truth بتاعها = كل آية فيها كل الكلمات، وبيتأكد منه test على الداتا بيز. **النتيجة على 80 حالة إيجابية: R@1 = R@5 = MRR = 100%**، وصفر false positives على 8 سلبيات. حالات العبارات بترجع نفس آيات الـ baseline وقبل أي مرحلة أضعف.
- **الأداء:** p50 = 0.03ms، p95 = 0.13ms (الهدف < 30ms).
- **لسه (وقت S5):** LRU cache، و`/search/suggest`، و`/admin/search/reindex`، والتصحيح. ✅ كلهم اتعملوا في 11.11. الصوتي (Phase 4) لسه.

### 11.11 Phase 3 — التسامح مع الأخطاء + بنود 5.11 (cache، suggest، reindex) · 2026-11-16
**الحالة:** اتنفذ ومستني الموافقة. **معايير Phase 3 اتحققت:** Recall@5 على الأخطاء = **100%** (المطلوب ≥ 90%)، و**التصحيح الغلط = 0%** (المطلوب < 2%).

**مصحح الكلمات (5.5)، `search/query/token-corrector.ts`:**
- **قاعدة 5.1 مطبقة حرفياً:** الكلمة اللي في القاموس **عمرها ما بتتغير**. اتأكدنا على **كل** الـ 14,616 كلمة في القاموس + 2000 مقطع آيات: صفر تصحيح.
- **التصحيح التلقائي** بيشتغل بس لو المراحل 0–3 ما لقيتش حاجة، والاستعلام مش مرجع، وفيه كلمة مش في القاموس.
- **لو كل الكلمات في القاموس والنتايج صفر:** مفيش تصحيح، وبيرجع `didYouMean` (لحد 3 استعلامات، كل واحد بيغيّر كلمة واحدة لجار قريب، **وبنتأكد إن ليه نتايج**).
- **ترتيب المرشحين لكل كلمة مش في القاموس:**
  - **phonetic:** تكلفة 0.5 (`search/text/phonetic.ts`، المجموعات من 5.3).
  - **Damerau-Levenshtein:** على مرشحين من الـ trigram index (`search/text/edit-distance.ts`). الحدود: ≤3 حروف مفيش، 4–5 ≤ 1، ≥6 ≤ 2. التبديل المتجاور = 1. الاستبدال بحرف جنبه على كيبورد العربي 101 = 0.5.
  - **skeleton:** آخر خيار، تكلفة 3، ومطابقته بتبقى `loose`.
  - **دمج:** كلمتين جنب بعض، واحدة منهم على الأقل مش في القاموس، ولما يتجمعوا يبقوا كلمة في القاموس.
  - **تقسيم:** لـ 2–3 كلمات (كل جزء ≥ حرفين)، وكمان بعد شيل `ال/و/ف/ب/ل`. بيتجرب لو مفيش مرشح لكلمة واحدة، **أو كـ fallback** لو القراءة الأولى ما لقيتش نتايج (`بسمالله` → `بسم الله`).
- **الترتيب:** التكلفة، بعدين df، بعدين نفس الطول. بنحتفظ بكل المرشحين لحد التكلفة الأفضل + 0.5، بحد أقصى **12** ("يعرض الاتنين" 5.12: `الظالين` → `الظالمين` و`الضالين`).
- **ليه 12:** اتقاس على 1000 خطأ صناعي. 4 → 96.1%، و8 → 98.3%، و12 → 98.9% R@5، بنفس الـ latency، وصفر نتايج واثقة غلط على 15 جملة عربي عادي.
- **matchQuality (5.6):** exact 1، phonetic 0.85، edit1 0.75، edit2 0.6، skeleton 0.4. الدمج/التقسيم مش موجودين في الجدول، **فاتعاملوا زي phonetic (0.85)**.

**الاسترجاع (5.6):**
- **المرحلة 4 `corrected` (وزن 40، confidence `medium`):** الآيات اللي فيها كلمة مقبولة لكل خانة من الاستعلام المصحح.
- **اختيار القراءة لكل آية:** بنختار أحسن قراءة: أقل تكلفة، بعدين ترتيب المرشح، بعدين أعلى score. الكلمة لو اتاخدت لخانتين لازم تتكرر في الآية (عشان كده `الرحمن الرحم` بتتقري `الرحمن الرحيم` ومش `الرحمن` مرتين).
- **ترتيب النتايج:** بتكلفة التصحيح الأول، فالكلمة النادرة اللي جت بنفس تكلفة التعديل ما تسبقش الأرجح (`الربوا` → `الربا` ومش `اغرقوا`).
- **المرحلة 6 `loose` (وزن 10، confidence `low`):** لما التصحيح احتاج skeleton.
- **`corrected` في الرد:** `{ applied: true, text, changes: [{ from, to, kind }] }` حسب القراءة اللي جابت أول نتيجة، أو `null`.
- **قاعدة الإيقاف (10 نتايج)** بتشتغل على المراحل الجديدة كمان.

**بنود 5.11:**
- **LRU cache:** 200 مدخل، 5 دقايق، ومش بنخزن قوائم أكبر من 1000 نتيجة (حد للرام).
  - **المفتاح:** `type + normalized + نتيجة parse المرجع`. ⚠️ **انحراف بسيط عن "normalizedQuery+type":** المرجع بيتقري من النص الخام (`2:255` و`2 255` ليهم نفس الـ normalized بس معناهم مختلف)، فلازم يدخل في المفتاح.
  - الـ cache بيتمسح لما الـ snapshot يتغير (reindex). الصفحات والـ highlights بتتحسب بعد الـ cache.
  - **اتقاس:** استعلامات الأخطاء الـ 39 = p50 4.2ms من غير cache → 0.013ms منه. من خلال HTTP، استعلام خطأ = 63ms أول مرة (process لسه بادئ، cold) و1.8ms المرة التانية.
- **`GET /search/suggest`:** بيكمّل آخر كلمة بالـ prefix من القاموس (الأكثر تكراراً الأول، والكلمة نفسها `exact`). لو أقل من 5 والكلمة مش في القاموس، بيكمّل بمرشحين التصحيح.
  - **مفيش "عبارات شائعة":** مصدرها مش محدد (انظر القرارات تحت).
  - throttler `default` بس، لأنه بيتنادى مع كل حرف.
- **`POST /admin/search/reindex`:**
  - في `search/admin-search.controller.ts` تحت `admin/search`، فالـ `AdminAuthGuard` العام بيحميه (من غير أي كود auth جديد).
  - طلبين في نفس الوقت بيشاركوا بناء واحد.
  - الفشل بيرجع 503 برسالة عامة، **من غير تفاصيل الداتا بيز**.

**Golden (5.12):**
- 135 حالة: 80 نضيفة + 39 أخطاء + 16 سلبية.
- **الأخطاء على 4 فئات:** رسم عثماني 8، حرف ناقص/زايد/مبدل 15، حروف متشابهة 10، دمج/تقسيم 6.
- **كل حالة خطأ فيها `intended`.** الـ `expected` = كل آية فيها الـ intended كعبارة، والـ db-spec بيتأكد منه، وبيتأكد كمان إن الاستعلام فيه كلمة مش في القاموس.
- **اتضاف 8 سلبيات** جمل عربي عادي، عشان نتأكد إن المصحح ما بيطلعش نتايج واثقة غلط.

**النتايج على الداتا بيز الحقيقية (قراءة بس):**

| المقياس | النتيجة |
|---|---|
| Golden نضيف (80) | R@1 = R@5 = MRR = 100% |
| Golden أخطاء (39) | R@1 = R@5 = MRR = 100%، والنص المصحح = المقصود 39/39 |
| سلبيات (16) | صفر نتايج واثقة غلط |
| 1000 خطأ صناعي | R@1 97.6%، R@5 98.9%، التصحيح = الأصل 97.6%. الأضعف الحذف (R@5 95.6%) |
| Latency الاستعلامات المصححة | p50 2.45ms، p95 11.5ms (الهدف < 30ms) |
| Latency الاستعلامات العادية | p95 0.17ms |

**الملفات الجديدة:**
- `search/text/phonetic.ts` و`search/text/edit-distance.ts`
- `search/query/token-corrector.ts`
- `search/cache/lru-cache.ts`
- `search/admin-search.controller.ts`
- `vocabulary.ts` (اتوسع بـ byPhonetic/bySkeleton/trigrams/prefix)
- `inverted-index.ts` (`docsMatchingSlots`)
- الاختبارات: `test/search-corrector.db-spec.ts`، و`test/admin-search.e2e-spec.ts`، و`search.service.phase3.spec.ts`، و specs لكل module.

**الأمان:**
- المدخلات محدودة بنفس قيود `q`.
- عدد القراءات لكل آية في المرحلة 4 محدود (256).
- الـ reindex محمي بالـ guard ومش بيكشف أخطاء.
- مفيش أي كتابة على الداتا بيز.
- الـ access log بيسجل المسار بس من غير نص الاستعلام.

**لسه / قيود معروفة:**
- ✅ **(اتعملت في 11.12)** ~~المرحلة 5 `partial` (≥ 60% من الكلمات) ما اتعملتش:~~ الـ roadmap حاطط Phase 3 = المصحح + "هل تقصد"، والـ partial موصوف في 5.6 و5.10 للتلاوة الناقصة/الصوتي. محتاج قرار: Phase 4 ولا دلوقتي؟ لحد ما يتعمل، كلمة مالهاش مرشح بتخلي الاستعلام كله صفر.
- **FULLTEXT fallback من المرحلة 6 ما اتعملش:** الفهرس in-memory بيغطي كل اللي FULLTEXT بيلاقيه (وFULLTEXT بيشيل الكلمات أقل من 3 حروف). ولو اتعمل، كل بحث فاشل هيبقى query على الداتا بيز.
- **رابط "[ابحث عن Y فعلاً]" في 6** محتاج باراميتر يقفل التصحيح، وده مش موجود في 5.7. ما اتضافش. من غيره، البحث بالنص الأصلي هيرجع صفر على أي حال (الكلمة مش في القاموس).
- **suggest:** مفيش "عبارات شائعة"، والـ prefix مش بيتعمل في `/search` النصي (5.5 خطوة 2 خاصة بالكتابة/الصوت).
- **الـ golden:** بقى 143 حالة بعد 11.12 (5.12 بيقول 150–300).
- **الـ cache والـ throttler in-memory** (instance واحد، زي 11.7).

### 11.12 Phase 4 — البحث الصوتي (الجزء الخاص بالباك إند) + المرحلة 5 `partial` · 2026-11-16
**الحالة:** اتنفذ. الجزء الخاص بالفرونت من Phase 4 (VoiceSearchButton، والـ Web Speech API، وتعديل النص قبل/بعد البحث، واختبار الأجهزة واللهجات) لسه، ومستني الفرونت.

**`type=voice` (5.7):**
- **تسامح أوسع:** تعديل زيادة لكل كلمة من 4 حروف: 4–5 ≤ 2، و≥6 ≤ 3. الكلمات ≤ 3 حروف لسه من غير fuzzy.
- **الدمج "بقوة":** كلمتين من القاموس بيتدمجوا لو مجموعهم كلمة في القاموس (الـ STT بيقسم: `ال رحمن` → `الرحمن`). **الكلمة الواحدة اللي في القاموس لسه عمرها ما بتتبدل بكلمة تانية (5.1)**، والدمج ده للـ voice بس.
- **prefix على آخر كلمة (5.5 خطوة 2):** لو آخر كلمة مش في القاموس (≥ 3 حروف)، بتتكمّل من القاموس (`الفل` → `الفلق`). النوع `prefix`، والتكلفة 0.5، والـ quality 0.75 (مش موجود في جدول 5.6، فاتعامل زي edit1).
- **التصحيح في الـ voice** بيشتغل كمان لو كل الكلمات في القاموس، بس فيه دمج ممكن.
- **`alts` (5.10):**
  - بدائل الـ STT بالترتيب (الأرجح الأول)، مفصولة بـ `|` في باراميتر واحد (لأن الباراميتر المتكرر = 400 حسب 11.3). لحد 5، وكل بديل بنفس قيود `q`.
  - مع `type=text` → 400.
  - كل نص بيتبحث لوحده (من خلال الـ cache)، والنتايج بتتجمع: لكل آية أحسن hit (المرحلة الأقوى الأول، بعدين الـ score ناقص `ALT_PENALTY = 2` × ترتيب البديل).
  - `reference`/`corrected`/`didYouMean` بييجوا من النص اللي جاب أول نتيجة.
  - مفيش نسبة ثقة من الـ STT في الـ API، وترتيب البدائل هو المؤشر الوحيد (انظر القرارات).
- **الرد (voice بس):** `query.alternatives` (البدائل بعد التطبيع)، و`query.selected` (النص اللي جاب أول نتيجة).

**المرحلة 5 `partial` (5.6، وزن 25، confidence `low`):**
- **الشرط:** آيات فيها ≥ 60% من خانات الاستعلام، وعلى الأقل 2، والاستعلام ≥ 3 كلمات (مع كلمتين بس، الـ partial هو نفسه all_terms).
- كل خانة ممكن تتطابق بأي اختيار من اختيارات التصحيح بتاعها. الكلمة المكررة في الاستعلام لازم تتكرر في الآية.
- **بيشتغل للـ text والـ voice**، بس لما المراحل 0–3 ما تلاقيش حاجة، وبعد `corrected` (4) وقبل `loose` (6)، وبقاعدة الإيقاف.
- **مثال:** تلاوة دخلت في الآية اللي بعدها (`قل هو الله احد الله الصمد` → 112:1)، أو كلمة غلط مالهاش تصحيح.
- النتايج `low`، فالفرونت بيعرض أفضل 3 اقتراحات (5.7).

**Golden:** 143 حالة: 80 نضيفة + 39 أخطاء + **8 صوتي** (`type: voice`، و`tier: voice`، ومعاهم `intended`).
- **الحالات الصوتية:** تلاوة داخلة في الآية اللي بعدها، وكلمة آخرها مقطوع، وكلمة غلط في السمع، و`ح→ه`، و`ال رحمن`.

**النتايج على الداتا بيز الحقيقية (قراءة بس):**

| المقياس | النتيجة |
|---|---|
| Golden نضيف | 100% |
| Golden أخطاء | 100% |
| Golden صوتي | 100% |
| سلبيات (16) | صفر نتايج واثقة غلط |
| قاعدة 5.1 (14,616 كلمة + 2000 مقطع) | صفر تصحيح غلط |
| خطأ صناعي | R@5 99.1% |
| Latency | p95 11.5ms للمصحح، و0.13ms للعادي |

**الاختبارات:** 792 unit+e2e، و65 text-utils، و68 DB. lint وtypecheck وbuild نضاف.

**قرارات محتاجة موافقتك:**
1. **صيغة `alts`:** باراميتر واحد مفصول بـ `|` بدل الباراميتر المتكرر. ومفيش نسبة ثقة لكل بديل.
2. **عتبات الـ voice:** +1 تعديل، والـ prefix ≥ 3 حروف.
3. **المرحلة 5 `partial` للـ text كمان** (مش للصوت بس)، كـ fallback بـ confidence `low`.
4. **`/search/voice` (رفع صوت لـ Whisper، الـ Plan B في 5.10)** ما اتعملش: محتاج خدمة STT خارجية ومفاتيح.
5. **جدول استبدالات اللهجة المصرية** (5.10) ما اتعملش: "مش مطلوب في v1، نقيس الأول".

### 11.13 Phase 4 (الفرونت الصوتي) + Phase 5 (السلة وتصدير PDF) · 2026-11-16
**الحالة:** اتنفذ واتجرب في متصفح حقيقي (Chrome headless): بحث بخطأ إملائي → شريط التصحيح + highlights، وإضافة للسلة، والاقتراحات أثناء الكتابة، وصفحة السلة + اختيار التفسير، وتحميل PDF.

**الفرونت (`apps/frontend`، workspace جديد):**
- Next.js 15.5 (App Router) + React 19 + Tailwind 4 + Zustand 5. RTL، ووضع ليلي تلقائي.
- **الخط:** Amiri Quran محلي في `public/fonts`، وترخيصه OFL 1.1 في `OFL.txt`.
- `lint` = `tsc --noEmit` (أمر `next lint` اتشال من Next 15.5).
- **`/search`:**
  - **`SearchBox`:** اقتراحات من `/search/suggest` بـ debounce 200ms، وتشتغل بالكيبورد.
  - **`VoiceSearchButton`:** Web Speech API (`ar-SA`/`ar-EG`، و`interimResults`، و`maxAlternatives=5`). بيبعت `type=voice` + `alts`. النص اللي اتسمع بيظهر وقابل للتعديل، والبدائل أزرار. لو اتعدّل، بيتبحث كـ `text`.
  - **عرض النتايج:** شريط "تم البحث عن X بدلاً من Y"، و"هل تقصد"، ورسالة المرجع الغلط، و503/429. لو أول نتيجة `low`، بيظهر أفضل 3 + "عرض كل النتايج" (5.7). الـ highlights من `highlights` على `textUthmani`.
  - الحالة في الـ URL (`q`، `page`، `type`).
- **السلة (spec 4.1):**
  - `useCartStore` بيخزن `quran_cart` **بالشكل اللي في الـ spec بالظبط** (`{ ayahId; tafsirBookId? }[]` من غير wrapper)، ومن خلال `lib/localStore.ts` بس. الحد 100.
  - `CartToggle` في كل `AyahCard`.
  - `FloatingCart`: عداد + Drawer + حذف + "تحميل PDF".
  - صفحة `/cart`: مراجعة + اختيار تفسير لكل آية من `/tafsir-books`، يعني الكتب المؤكدة بس.

**الباك إند:**
- **`GET /ayahs?ids=`:** endpoint قراءة جديد. الـ spec بيخزن ids بس في السلة، فالسلة محتاجة النصوص.
- **`POST /export/pdf`** (`src/export/`):
  - بيجيب الآيات، والسور، والتفسير المطلوب (**قراءة بس**؛ ده ثاني مكان بيقرا `tafsirs.content` بعد `/tafsirs`، وبس لما يتطلب).
  - كتب التفسير المستخبية (0/2/3/4) أو اللي مش موجودة → 400.
  - **HTML template:** RTL، والخط مضمّن base64، و"سورة X - آية Y"، والنص العثماني، والتفسير. كل نص من الداتا بيز بيتعمله escape.
  - **Puppeteer:** `puppeteer-core` 24 + متصفح موجود على الجهاز (`PDF_BROWSER_PATH` أو auto-detect). اخترناه بدل `puppeteer` الكامل، لأن npm 11 بيمنع سكربت تحميل Chrome، والـ spec بيسمح بـ puppeteer-core.
  - **التشغيل:** متصفح واحد بيتعاد استخدامه، ولحد 2 render في نفس الوقت، و30 ثانية حد أقصى. **أي طلب network من الصفحة بيتمنع** (كل حاجة inline).
  - **الأرقام:** A4، وترقيم صفحات. أول ملف 860ms (منها تشغيل المتصفح)، والملفات بعده ~110ms.
  - throttler جديد `export` (10/دقيقة). الخط بيتنسخ لـ `dist` بـ `nest-cli.json` assets.

**الاختبارات:** backend 822 (منها export unit 13 + e2e 17)، و text-utils 65. lint وtypecheck لكل الـ workspaces، والـ build نضيف. اختبار حقيقي على الداتا بيز الحقيقية: PDF 191KB، و400 للكتاب 2، و404 لآية مش موجودة.

**قيود / لسه:**
- الفرونت مفيهوش صفحات القراءة (Phase 1 فرونت)، ولا الإعدادات/الختمة/bookmark/المشاركة (باقي Phase 5).
- **مفيش unit tests للفرونت.** اتأكدنا بالـ typecheck والـ build والتجربة في المتصفح.
- **البحث الصوتي** محتاج تجربة يدوية على أجهزة ولهجات (Phase 4: "اختبار على عدة أجهزة ولهجات"). Safari/iOS ضعيف (5.10).
- **`npm audit`:** 2 ثغرات في أدوات التطوير (`@nestjs/cli`/`jest` → `deepmerge`)، مش في الـ runtime. الإصلاح محتاج ترقية major للـ Nest CLI.
- **السيرفر محتاج Chrome/Chromium** للـ PDF (على VPS: `apt install chromium` + `PDF_BROWSER_PATH`).

**قرارات محتاجة موافقتك:**
1. **`GET /ayahs?ids=`** endpoint جديد مش في الـ spec. البديل: نخزن نص الآية في السلة، وده بيخالف شكل `quran_cart`.
2. **puppeteer-core + متصفح النظام** بدل `puppeteer` الكامل.
3. **شكل الـ PDF:** كتيّب متصل (مش آية في كل صفحة). الـ spec بيسيبها اختيار.

### 11.14 قرارات اتاخدت (2026-11-16) + متطلبات تشغيل الـ PDF
**قرارات 11.13 اتحسمت:**
1. ✅ **`GET /ayahs?ids=` باقي.** `quran_cart` بيخزن ids بس (spec §3).
   - **التحقق:** ids أرقام صحيحة بس (`1.5` و`1e2` و`-1` و`1,,2` والباراميتر المتكرر = 400)، من 1 لحد أقصى INT UNSIGNED.
   - **العدد:** من 1 لـ **100** id (نفس حد السلة والتصدير)، والمكرر بيتشال (أول مكان بيفضل).
   - كل ده عليه e2e tests.
2. ✅ **`puppeteer-core` + متصفح موجود على السيرفر** (مش `puppeteer` الكامل).
3. ✅ **الـ PDF كتيّب واحد متصل** (آيات + تفاسير ورا بعض، ومفيش صفحة لكل آية). الـ `article` بس مش بيتقسم بين صفحتين (`break-inside: avoid`).

**متطلبات تشغيل `POST /export/pdf` (الإنتاج):**
- **المتصفح:** لازم Chrome أو Chromium حديث (stable) متثبت على السيرفر. اتجرب محلياً على Chrome 157 مع `puppeteer-core` 24.43.
  - **Debian/Ubuntu:** `apt install chromium` (أو Google Chrome stable).
  - **Docker:** صورة فيها chromium، وتشغيل الـ process كـ **user مش root** (Chrome بيرفض الـ sandbox كـ root، والكود مش بيستخدم `--no-sandbox` عمداً).
- **`PDF_BROWSER_PATH`:** المسار الكامل للمتصفح (مثلاً `/usr/bin/chromium`).
  - لو مش متحدد، بيدوّر في المسارات المعتادة لكل نظام (`BROWSER_CANDIDATES` في `pdf-renderer.service.ts`).
  - لو المتصفح مش موجود: `POST /export/pdf` بيرجع **503** برسالة عامة، والسبب بيتكتب في اللوج (`No Chrome/Chromium/Edge found…`)، وباقي الـ API شغال عادي.
- **الخطوط:** مش محتاجة تتثبت على السيرفر. Amiri Quran مضمّن في الـ HTML (`dist/export/assets/fonts`).
- **الموارد:** متصفح واحد بيفضل شغال بعد أول تصدير، ولحد 2 render في نفس الوقت. حسب حوالي 300MB رام زيادة.
- **الحدود:** throttler `export` (10/دقيقة/IP)، و30 ثانية حد أقصى للملف، و100 آية حد أقصى للطلب، والـ body حده `BODY_LIMIT`.
- **Serverless مش مناسب** (انظر 9.3): المتصفح والفهرس in-memory محتاجين process ثابت (VPS أو container).

### 11.15 Phase 5 (الفرونت) — القراءة، والإعدادات، والختمة، والـ Bookmark، والمشاركة كصورة · 2026-11-16
**الحالة:** اتنفذ واتجرب. مفيش أي تغيير في منطق الباك إند، ومفيش كتابة على الداتا بيز. التغييرات الوحيدة في `apps/backend`: ترقية أمان `puppeteer-core` 24→25، و e2e tests للتحقق من `/ayahs`.

**قرارات اتحسمت (2026-11-16):**
1. **تقدّم الختمة بزرار «تمت القراءة» بس.** التمرير عمره ما بيتحسب.
2. **اليوم بيتحسب مكتمل** بس لما هدفه الكامل يتحقق.
3. **الثيم:** بيتبع الجهاز لحد ما المستخدم يختار.
4. **عثماني/إملائي:** على صفحات القراءة بس. نتائج البحث بتفضل عثماني.
5. **المواضيع والتفسير:** اتعملوا. مقارنة التفاسير جنب بعض مستنية كتاب تفسير تاني مؤكد.

**الصفحات (spec §2):**
- **`/surah`:** فلترة بالاسم أو الرقم.
- **`/surah/[number]`:** السورة كاملة؛ البقرة = 3 طلبات × 100، و cache ساعة.
- **`/topics`:** الشجرة.
- **`/topics/[id]?page=`.**
- **`/khatma`.**
- **الرئيسية:** «أكمل القراءة» + ملخص الختمة.

**قواعد الصفحات:**
- الـ params بتتقري بشكل صارم، وأي رقم غلط = **404 حقيقي**. اتشال `loading.tsx` من الـ root، لأنه بيخلي `notFound()` يرجع 200.
- لو الـ API واقع: `error.tsx` مع زرار إعادة المحاولة، والرئيسية بتفضل شغالة.
- **حالات فاضية:** مفيش سور، أو مفيش آيات، أو مفيش مواضيع، أو تفسير مش متوفر.
- **حالات تحميل:** للتفسير والختمة وصورة المشاركة.

**مكونات الآية** (`AyahList`، في السورة والموضوع):
- **«التفسير»:** بيتحمّل عند الطلب، من الكتب المؤكدة بس، ومعاه حالات خطأ وإعادة محاولة.
- **«مشاركة كصورة»** و **«تمت القراءة»** (لو فيه ختمة) و **«أضف للسلة»**.
- **البسملة:** مفيش header للفاتحة والتوبة، ولا لما نص 1:1 مخزّن بيبدأ بيها. **97:1 متخزنة كده (`بِّسْمِ` بشدة زيادة)**، فالمقارنة بالحروف من غير تشكيل، والبسملة نفسها متاخدة code point بـ code point من 1:1 في الداتا بيز.

**localStorage (الأشكال بالظبط زي spec §3):**
- كل حاجة بتعدي على `lib/localStore.ts` (مفيش استثناء، حتى سكربت الـ boot).
- **`lib/shapes.ts`:**
  - بيتحقق من كل مفتاح عند القراءة؛ أي قيمة مش مطابقة بتتعامل كأنها مش موجودة.
  - عمره ما بيكتب مفاتيح زيادة.
  - الـ cart بيتخزن array صافي من غير wrapper بتاع zustand.

| المفتاح | السلوك |
|---|---|
| `quran_settings` `{fontSize 16–32, theme, script}` | **بيتطبق فوراً** (CSS var `--quran-size` + class `dark` على `<html>`)، وبيتحفظ بعد الـ reload. سكربت في `<head>` بيطبقه قبل أول رسم، فمفيش flash. ⚠️ **تعارض اتحل كده:** شكل الـ spec فيه `theme` دايماً، فمفيش حاجة بتتكتب لحد ما المستخدم يغيّر أي إعداد، والثيم بيتبع الجهاز (وبيتغير معاه لايف). أول ما يتغير أي إعداد، الثيم الحالي بيتحفظ معاه |
| `quran_bookmark` | آخر آية ظاهرة في صفحة السورة (IntersectionObserver ≥ 60% + debounce 500ms). مفيش كتابة لو نفس الآية. **مستقل تماماً عن الختمة** |
| `quran_khatma` | `lib/khatma.ts` (pure). `dailyTarget = ceil(6236/days)`. ورد اليوم n = الآيات `(n·t, (n+1)·t]`، وآخر يوم فيه الباقي. «تمت القراءة» على آية بيعلّم كل اللي قبلها، والآية المقروءة **مش ممكن تتعلم تاني** (زرارها بيبقى «✓ مقروءة»، والدالة بترجع نفس الـ object، فمفيش كتابة). اليوم بيدخل `completedDates` مرة واحدة لما `lastAyahId` يوصل لنهاية ورد اليوم، والتعويض محسوب. تنبيه بعد الساعة 8 بالليل، و streak، ومتقدم/متأخر |
| `quran_last_route` | بيتسجل مع كل صفحة والتمرير (debounce)، **ما عدا صفحات الخطأ والـ 404** (`data-no-restore`). أول فتح لـ `/` بيرجع للصفحة الأخيرة (spec 4.8). المسار لازم يبقى داخلي (مفيش open redirect) |

**المشاركة كصورة (spec 4.4):**
- الكارت: عرض 1080px × `pixelRatio` 2 = **PNG بعرض 2160px**، و RTL، و Amiri Quran (بيستنى الخط يتحمّل).
- **الآيات الطويلة:** حجم الخط بينزل بطول الآية (64→30px)، و**الارتفاع تلقائي، فمفيش قص** (اتجربت على 2:282).
- المعاينة هي نفس الـ PNG. `navigator.share` (ملفات) لو مدعوم، وإلا تحميل `quran-<سورة>-<آية>.png`.
- الحزمة: `html-to-image` 1.11.

**الاختبارات:**
- **Vitest:** 30 test.
  - الأشكال والتحقق.
  - الختمة: من غير تكرار، والإكمال بالهدف الكامل، والتعويض، وآخر يوم، و streak، والتنبيه، والتواريخ.
  - `AyahIndex`: round-trip للـ 6236 id.
  - البسملة (بنص 97:1 الحقيقي)، والـ params، وأحجام المشاركة، والـ highlights، و client البحث.
  - الـ stores تحت jsdom، ومعاها الأشكال المحفوظة بالظبط.
- **Browser journeys** (`e2e/journeys.test.mjs`، node:test + puppeteer-core، و context نضيف لكل test): **10/10**:
  - السور + البسملة.
  - 404 لـ 7 روابط غلط (ومش بتتسجل كآخر صفحة).
  - المواضيع.
  - التفسير وفشله.
  - الإعدادات (فوري + reload + الشكل + البحث عثماني).
  - الـ bookmark وآخر صفحة.
  - الختمة (التمرير مش بيتحسب، من غير تكرار، والإكمال عند 416).
  - المشاركة (share + download، 2160px، من غير قص).
  - البحث + السلة + PDF.
  - API واقع (صفحة الخطأ + الرئيسية شغالة).
- **طريقة التشغيل:** على instances منفصلة (باك 3011، وفرونت 3012، وفرونت بـ API واقع 3013)، من غير لمس سيرفرات التطوير.
  - `NEXT_DIST_DIR=.next-e2e` بيفصل build الاختبار، وده متجاهل في git.
- **باقي الـ workspaces:** backend 828، و text-utils 65، و DB 68. lint/typecheck نضيف، و build للتلاتة.

**الترقيات (أمان):**
- `next` 15→16.4، و `vitest` →5.1، و `puppeteer-core` →25.17 (في الباك والفرونت).
- **فاضل في `npm audit --omit=dev`:** سلسلة Prisma CLI بس (`deepmerge-ts`). الحل Prisma 7، ومتأجل بقرار 11.6.
- **ثغرات أدوات التطوير** (jest، و Nest CLI، و typescript-eslint) محتاجة ترقيات major، ومتسجلة.

**ملاحظات تشغيل:**
- `npm run build` للباك بيعمل `prisma generate`، وعلى Windows بيفشل لو سيرفر الباك شغال (الـ DLL مقفول). وقف السيرفر الأول، أو استخدم `npx nest build`.
- الفرونت محتاج `API_URL` (للـ server components) و `NEXT_PUBLIC_API_URL` (للمتصفح، بيتحط وقت الـ build).

**لسه:**
- Phase 6 (الأدمن CRUD)، مرحلة منفصلة.
- مقارنة التفاسير (مستنية كتاب تاني مؤكد).
- PWA (اختياري، 4.8).
- **اختبار يدوي للبحث الصوتي** على أجهزة ولهجات حقيقية.

### 11.16 إعادة تصميم الواجهة حسب `frontend design/` · 2026-11-16
**ستايل بس:** المنطق والبيانات والنصوص زي ما هي، والباك إند ما اتلمسش.

**اتطبق:**
- **ألوان الديزاين:** خلفية داكنة (`--bg #121212`)، و surfaces `#1b1b1b`/`#232323`، و card كحلي للأبرز (`--hero #0c2754`)، و accent أزرق، وزرار أساسي أبيض، و badges خضرا/زرقا، و highlight كهرماني.
- **الوضع النهاري:** نفس التصميم معكوس (tokens في `globals.css`، و classes جاهزة `ui-card`/`ui-hero`/`ui-chip`/`ui-badge`…).
- **Top bar:** اسم التطبيق + ترس الإعدادات.
- **Bottom tab bar:** الرئيسية، والسور، والسلة (بتفتح sheet + عداد)، والبحث، والإعدادات (sheet). المواضيع والختمة من كروت الرئيسية.
- **عناوين الصفحات:** «→ العنوان». السهم بيرجع للرئيسية، أو للسور/المواضيع في الصفحات الفرعية.
- **الرئيسية:** كارت «أكمل القراءة» كحلي، وكارت الختمة، و grid 2×2 أيقونات.
- **السور/المواضيع:** صفوف بدائرة رقم أو أيقونة folder/file + chevron.
- **البحث:** المايك جوه خانة البحث.
- **الختمة:** كارت تقدم + ورد اليوم كحلي بزرار أبيض.
- **الإعدادات والسلة:** bottom sheets. الوضع الليلي بقى switch.
- **الأيقونات:** inline SVG (`components/Icon.tsx`)، من غير مكتبات جديدة.

**ما اتعملش (لأنه محتوى/مميزات جديدة مش ستايل):**
- صف «آخر 7 أيام» في الختمة.
- «مسح كل البيانات المحلية».
- رقم الإصدار.
- الأسماء الإنجليزية في قائمة السور.
- عدد المواضيع الفرعية.
- نص الآيات بيفضل بخط Amiri Quran، لأن علامات الرسم العثماني محتاجاه.

**الاختبارات:** 10/10 browser journeys (اتعدل اختبار واحد بس عشان الـ switch)، و Vitest 30، و backend 828، و text-utils 65. lint/typecheck نضيف، والـ build نضيف.


### 11.17 Phase 6 — لوحة الأدمن (Dashboard) · 2026-11-16
**الحالة:** اتنفذت واتجربت. مفيش migration ولا تغيير schema. الكتابة على الداتا بيز الحقيقية (`local`) **صفر**، وكل اختبارات الكتابة اتعملت على نسخة معزولة `local_test`.

**قرارات اتاخدت (2026-11-16):**
1. **اللي بيتعدل:** المواضيع (إضافة/تعديل/نقل/حظر/حذف + ربط وفك ربط الآيات)، وأسماء السور (`name_ar`/`name_en`)، واسم ومؤلف كتاب التفسير.
2. **قراءة بس:** نص الآيات ونصوص التفسير. **مفيش أي endpoint بيكتب فيهم** (والاختبارات بتتأكد إن `PATCH/PUT/DELETE/POST` عليهم = 404).
3. **كتب التفسير المخفية:** بتظهر في اللوحة بعلامة «مخفي»، والإظهار لسه في الكود (`HIDDEN_TAFSIR_BOOK_IDS`)، مفيش toggle.
4. **أول أدمن:** اتعمل في `local_test` بس. `local` فيه أدمن واحد موجود من قبل (مش من عندي)، وما اتلمسش. عمل `admin@quran.com` في `local` مستني قرارك.
5. **مفيش roles:** كل الأدمنز نفس الصلاحيات (الـ spec مفيهوش أدوار)، فمفيش إدارة حسابات ولا تسجيل عام.

**إنشاء أول أدمن (`scripts/seed-admin.ts`):**
- `ADMIN_INITIAL_PASSWORD='…' npm run seed:admin` → `admin@quran.com` / `Admin` (ممكن `ADMIN_EMAIL`/`ADMIN_NAME` يغيّروهم).
- **bcrypt cost 12** (نفس `AuthService`). الباسورد ≥ 12 حرف و ≤ 72 byte. عمره ما بيتطبع ولا بيتخزن plaintext، ومش موجود في الكود.
- **idempotent:** لو الإيميل موجود → "already exists; nothing changed" ومش بيغيّر الباسورد أبداً. INSERT بس.
- `ADMIN_PASSWORD` القديم **مبقاش بيتقري**.
- الداتا بيز اللي بيكتب فيها = `DATABASE_URL`. للتجربة: شغّله على `<db>_test` (انظر تحت). **لـ `local`/الإنتاج محتاج موافقة صريحة.**

**داتا بيز الاختبار (`scripts/create-test-db.ts`):** `npm run db:test:create`
- بيعمل `<db>_test` (أو `TEST_DATABASE_NAME`، ولازم ينتهي بـ `_test` ويختلف عن الأصل). بيمسحها ويعيدها كل مرة.
- من الأصل **قراءة بس** (`SHOW CREATE TABLE` + `INSERT … SELECT`). نفس الـ schema والـ FKs والمحتوى، و`admins` فاضي.

**الباك إند (`src/admin/content/`):** كل الـ routes تحت `/admin`، فالـ `AdminAuthGuard` العام بيحميها (JWT cookie، 401 موحّد). مفيش auth جديد.

| Method | المسار | ملاحظات |
|---|---|---|
| GET | `/admin/stats` | أعداد السور/الآيات/المواضيع (محظور، مخفي)/الروابط/الكتب (ظاهر)/التفاسير |
| GET | `/admin/suras` | الـ 114 |
| PATCH | `/admin/suras/:number` | `{ nameAr?, nameEn? }` (≤ 60، بعد trim). الاسم العربي لازم فيه حروف عربية، ومش مكرر بعد `normalize` → 409. تغيير `nameAr` **بيعيد بناء فهرس البحث** (البحث بالمرجع بيقرا الأسماء)، والرد `{ sura, reindex: 'done'|'failed' }` |
| GET | `/admin/topics?q=&status=all\|visible\|banned&page=&limit=` | كل المواضيع (المحظور كمان) + `hidden` (نفس قاعدة الـ API العام) + `ayahCount`/`childrenCount`. البحث بالعنوان بعد تطبيع عربي أو بالرقم. **مفيش `legacyUuid`/`titleRaw`** |
| GET | `/admin/topics/:id` | + `parent` و`children` |
| POST | `/admin/topics` | `{ title, description?, parentId? }` → 201. الأب لازم يكون موجود (400). نفس العنوان تحت نفس الأب (بعد التطبيع: `الصلاة`=`الصلاه`) → 409. بيتعمل دايماً غير محظور |
| PATCH | `/admin/topics/:id` | `{ title?, description?, parentId?, isBanned? }`. `description: ""` = null. ممنوع يبقى أب لنفسه أو لحد من فروعه (400). `null` على حقل مش nullable = 400 |
| DELETE | `/admin/topics/:id` | 204. لو ليه فروع → 409. روابطه بتتمسح (FK cascade)، والآيات ما بتتأثرش |
| GET | `/admin/topics/:id/ayahs?page=` | الآيات المربوطة |
| POST | `/admin/topics/:id/ayahs` | `{ ayahIds: int[] }` (1–100) → `{ added, skipped }`. آية مش موجودة → 404 ومفيش ربط |
| DELETE | `/admin/topics/:id/ayahs/:ayahId` | 204، أو 404 لو مش مربوطة |
| GET | `/admin/ayahs?sura=&page=` | قراءة بس |
| GET | `/admin/ayahs/lookup?refs=2:255,1:1` | لحد 100 مرجع في طلب واحد → `{ data, missing }` |
| GET | `/admin/tafsir-books` | كل الكتب + `hidden` + `tafsirCount` (اللي فيها نص) |
| PATCH | `/admin/tafsir-books/:id` | `{ name?, author? }` بس (`author: ""` = null). مفيش إضافة/حذف/إظهار |
| GET | `/admin/tafsirs?ayah_id=` | قراءة بس. كل الكتب **بما فيها المخفية** بعلامة `hidden` (للمراجعة)، والـ API العام لسه بيخبيها |

**الأمان:**
- **Mass assignment / escalation:** الـ DTOs whitelisted، وأي حقل زيادة (`role`، `id`، `isAdmin`، `legacyUuid`، `ayahCount`، `hidden`…) = 400، والـ service بيكتب الحقول بالاسم بس. مفيش قيمة صلاحية بتيجي من الفرونت.
- **الـ 401** نفس الرد لأي سبب (من غير cookie، أو token منتهي أو متلاعب فيه، أو secret/audience غلط، أو `alg: none`). الـ `Authorization: Bearer` مش بيتقبل، الـ cookie بس.
- أخطاء Prisma (`P2025`/`P2002`/`P2003`) لو حصل race → 404/409 برسالة عامة (`PrismaErrorsInterceptor`).
- **audit log:** `admin=<id> <action> <target>` من غير أي نص من الطلب.
- helmet وCORS والـ throttler (`default`) وشكل الأخطاء زي ما هم.

**الفرونت:**
- **الصفحات:**
  - `/admin` → `/admin/dashboard`.
  - `/admin/login`: validation، وحالة تحميل، ورسالة عامة للبيانات الغلط (مش بتفرّق بين الإيميل والباسورد)، و429، وانقطاع الشبكة، و«انتهت الجلسة»، و«تم تسجيل الخروج». **مفيش صفحة تسجيل**، و`/admin/register` = 404.
  - `/admin/dashboard`: إحصائيات + إعادة بناء الفهرس (بتأكيد).
  - `topics` (بحث debounce، وفلتر الحالة، وصفحات، وإضافة/تعديل/حظر/حذف بتأكيد).
  - `topics/[id]` (التفاصيل، والفروع، وربط آيات بالمرجع `2:255, 1:1-7`، وفك الربط بتأكيد).
  - `suras` (جدول + تعديل الأسماء)، و`ayahs` (قراءة بس)، و`tafsir-books` (تعديل الاسم/المؤلف + علامة مخفي)، و`tafsirs` (قراءة بس).
- **الحماية:** `AdminShell` بيسأل `GET /admin/auth/me`:
  - 401 → `/admin/login?next=…`.
  - أي 401 بعد كده (الجلسة خلصت) → `/admin/login?expired=1&next=…`.
  - الأدمن اللي داخل أصلاً بيترجع من صفحة الـ login للوحة.
  - `next` بيقبل مسارات `/admin/dashboard…` بس (مفيش open redirect).
  - **الحماية الحقيقية في الباك إند.** الفرونت بيقرر يعرض إيه بس.
- **الجلسة:** الـ cookie `httpOnly` بتاعة الـ API (`credentials: 'include'`). الفرونت عمره ما بيشوف token ولا بيخزنه (مفيش localStorage).
- **الشكل:**
  - sidebar للديسكتوب، وdrawer للموبايل، وheader فيه قائمة الحساب (الاسم، والإيميل، وآخر دخول، وخروج) وزرار ليلي/نهاري.
  - حالات loading وempty وerror وsuccess (toasts)، وconfirm dialogs، وforms بـ `aria-invalid`.
  - RTL، ونفس الـ tokens (`globals.css`).
- **التطبيق العادي:**
  - الـ TopBar والـ BottomNav مش بيظهروا على `/admin/*` (`isAdminPath` + `MainFrame`).
  - صفحات الأدمن **مش بتتسجل** كـ «آخر صفحة».
  - أي مسار مش معروف تحت `/admin` بيرجع 404 بصفحة الأدمن (`app/admin/[...missing]`).
- **ملفات:** `lib/admin.ts` (منطق صافي)، و`lib/adminApi.ts`، و`components/admin/*`، و`app/admin/**`.

**الاختبارات:**

| الأمر | النتيجة |
|---|---|
| `npm test` | backend **946** (منهم admin content e2e 100+ و unit)، و text-utils 65، و frontend Vitest **54** |
| `npm run test:db -w @quran/backend` / `-w @quran/text-utils` | 68 / 5 (قراءة بس على `local`) |
| `npm run test:write-db -w @quran/backend` | **7/7** على `local_test`. بيرفض يشتغل لو الداتا بيز مش `_test`. بيعمل دورة موضوع كاملة، وتغيير اسم سورة (+ reindex + بحث بالمرجع)، وتعديل كتاب، وكل حاجة بترجع زي ما كانت. **بيتأكد إن نص الآيات والتفاسير متطابق byte-by-byte** قبل وبعد. اختياري: `E2E_ADMIN_PASSWORD` بيجرب الـ login الحقيقي |
| browser journeys | **18/18** (`e2e/admin.test.mjs` 7 + الـ 11 القديمة). الأدمن بيتجرب على باك إند متوصل بـ `local_test` ومعاه `E2E_ADMIN_PASSWORD` (من غيره بيتعمل skip) |
| lint/typecheck و build (text-utils، و`nest build`، و`next build`) | نضاف |

**لسه / قيود:**
- **`admin@quran.com` في `local`:** مستني موافقتك.
- **مفيش token revocation:** الـ logout بيمسح الـ cookie بس (زي 11.6).
- **الحساب المحذوف:** الـ guard مش بيتأكد إن الأدمن لسه موجود لحد ما الـ token يخلص.
- **الـ lockout والـ throttler** in-memory.
- **تعديل اسم السورة:** صفحات القراءة عندها cache ساعة (11.15)، فالاسم الجديد ممكن ياخد لحد ساعة عشان يظهر هناك. البحث بيتحدث فوراً.
- **Postman:** اتضاف فولدر `09 - Admin dashboard (Phase 6)` (60 طلب). القراءة والـ 400/404/409/401 بتشتغل بـ `adminEmail`/`adminPassword`، والكتابة بس لو `allowAdminWrites=true` (وبترجّع كل حاجة زي ما كانت). اتجرب على `local_test`: 173 طلب و728 assertion من غير أي فشل.

### 11.18 التلاوة الصوتية (AlQuran Cloud) · 2026-11-17
**الحالة:** اتنفذت (باك + فرونت + أدمن). **مفيش أي اختبارات اتشغلت** (بطلب صريح)؛ اللي اتعمل typecheck و lint بس.

**الداتا بيز (إضافة بس):**
- `apps/backend/prisma/sql/001_quran_audio.sql`: 3 جداول جديدة بس، كلها `CREATE TABLE IF NOT EXISTS`: `audio_reciters` و`ayah_audio` (FK لـ `ayahs.id`، و unique على `(reciter_id, ayah_id)`) و`audio_sync_jobs`.
- بيتطبق بـ `npm run db:migrate:audio` (`scripts/apply-audio-migration.ts` بيرفض يشغّل أي statement غير CREATE TABLE IF NOT EXISTS للجداول التلاتة). **اتطبق على `local` بتاريخ 2026-11-17.** مفيش أي جدول قديم اتعدل.
- Prisma: 3 models + 4 enums اتضافوا يدوي في `schema.prisma`. **مفيش relation field اتضاف لـ `Ayah`/`Sura`.** ممنوع `prisma migrate`/`db push` زي ما هو.
- `.gitignore`: استثناء `!apps/backend/prisma/sql/*.sql` عشان الـ migration تتحفظ في git.

**الترقيم:** `QuranNumberingService` بيحسب الرقم العام (1..6236) من ترتيب السور والآيات، مش من `ayahs.id`، وبيتأكد إن البيانات كاملة ومتسقة (114 سورة، 6236 آية، `ayah_count` = الصفوف). لو مش متسقة → 503 بدل ما نربط آية بتسجيل غلط. (حالياً `ayahs.id` = الرقم العام في الـ 6236.)

**ملاحظات اتأكدنا منها من الـ API (2026-11-17):**
- 24 إصدار `ar` + `versebyverse`.
- **edition غلط بيرجع 200 بإصدار نصي** (fallback صامت)، فكل رد بيتأكد من `edition.identifier` و`format=audio`.
- الـ bitrate بيختلف حسب القارئ (128/192/64/48/32). وفيه ملفات ناقصة فعلاً على الـ CDN (مثلاً `ar.husary` 128 مفيهوش 4089، و`ar.mahermuaiqly` 64 ناقصه 4).
- `info.json` بتاع الـ CDN (~18MB) = directory listing (مش documented)، وبيتقري بحذر.

**التحقق:**
- **مزامنة القرّاء:** لكل قارئ 3 طلبات `/ayah` (1:1، 2:255، 114:6). لازم الـ edition والسورة والآية والرقم العام (مقارنة بترقيمنا) ونمط رابط الـ CDN يطابقوا، ونفس الـ bitrate، و HEAD على أول ملف = 200 audio. وإلا `bitrate = NULL` + `verification_error`.
- **مزامنة الروابط:** لكل قارئ مؤكد ولكل آية: الرابط بيتحفظ **بس لو الملف موجود في الـ listing** (الـ bitrate الأساسي، وبعدين الثانوية)، وإلا `missing`. لو الـ listing مش متاح → `/quran/{edition}` (طلب واحد للقارئ) وكل آية بتتقارن بترقيمنا. Batches من 500 بـ `INSERT … ON DUPLICATE KEY UPDATE` (idempotent). الـ job بيتحفظ (cursor + القرّاء الباقيين)، وبيتعمله resume؛ وأي job "running" بعد restart بيتعلّم `interrupted`.
- **التشغيل:** صف `ayah_audio` (`synced`) ← نمط القارئ المؤكد (`template` + `fallbackUrls` بالـ bitrates التانية) ← `/surah` أو `/ayah` live بتحقق لكل آية (`api`). أي رابط بيترجع لازم يطابق `https://cdn.islamic.network/quran/audio/{bitrate}/{edition}/{global}.mp3` لنفس القارئ والآية.
- **من غير مزامنة / لو الجداول مش موجودة:** القائمة والروابط بتيجي live من الـ API (cache 6 ساعات)، والتطبيق شغال.

**الـ API:**
| Method | المسار | ملاحظات |
|---|---|---|
| GET | `/quran-audio/reciters` | `{ data, defaultReciter, source: 'database'\|'live' }`. المفعّل والمتاح بس. الافتراضي `ar.alafasy` |
| GET | `/quran-audio/reciters/:identifier` | 404 لأي قارئ مش متاح |
| GET | `/quran-audio/ayah/:surah/:ayah?reciter=` | `{ reciter, sura, track }`. 404 لو مفيش تسجيل للآية |
| GET | `/quran-audio/surah/:surah?reciter=` | `{ reciter, sura, tracks, missing }` (`url: null` = مفيش تسجيل) |
| GET | `/admin/quran-audio/overview` | الإحصائيات + القرّاء + حالة المزامنة + `schemaReady` |
| GET | `/admin/quran-audio/editions` | كل إصدارات الصوت + `compatible` |
| PATCH | `/admin/quran-audio/reciters/:identifier` | `{ isActive }` بس |
| POST | `/admin/quran-audio/sync/reciters` | `{ force? }` → 202 + job. `force` = تحديث بيانات الكل |
| POST | `/admin/quran-audio/sync/audio` | `{ resume?, reciters? }` → 202 + job. 409 لو فيه job شغال أو مفيش حاجة تتعمل |
| GET | `/admin/quran-audio/sync/status` | `{ running, lastReciterJob, lastAudioJob }` |

- الـ admin routes تحت `/admin` فالـ `AdminAuthGuard` العام بيحميها. الـ client: concurrency 3، ومسافة 150ms، و 3 retries بـ backoff، و timeouts، وحد أقصى للحجم.

**الفرونت:**
- `store/useAudioStore.ts`: **controller واحد** (عنصر `<audio>` واحد + عنصر preload للآية الجاية). كل طلب بياخد token، والطلبات القديمة بتتلغي (ضغط سريع، تغيير القارئ، تغيير السورة). تكرار (1–10 أو مستمر)، ووضع (آية / السورة / متواصل للسورة التالية)، وتجربة الـ bitrates التانية لو الملف فشل، وتخطي الآيات المفقودة في التشغيل المتواصل، و Media Session.
- `components/audio/`: `AudioPlayerBar` (فوق الـ bottom nav؛ بيضبط `--player-h` فالـ main والـ ScrollToTop ولوحة وضع المصحف بيتزحزحوا)، و`AyahPlayButton` (على كل آية في السور والمواضيع ونتايج البحث) + «تشغيل السورة»، و`ReciterSelect` (في المشغّل وفي شيت الإعدادات).
- الآية اللي بتتقري بتتظلل وبيتعمل لها scroll. المشغّل مش بيظهر في `/admin` (وبيقف هناك).
- localStorage: مفتاح جديد `quran_audio` `{ reciter, volume, repeat, mode }` (`parseAudioPrefs`). **مش من spec §3**، و`quran_settings` ما اتغيرش.
- الأدمن: `/admin/dashboard/audio` (التلاوات): إحصائيات، وتقدّم الـ job (polling كل 2 ثانية)، والأخطاء، ومزامنة/تحديث القرّاء، ومزامنة/استئناف الروابط، وتفعيل/إخفاء قارئ، وقائمة الإصدارات.

**لسه / قيود:**
- **مفيش اختبارات** للميزة دي (ولا اتشغّلت اختبارات قديمة).
- `prisma generate` على Windows فشل في استبدال الـ DLL (السيرفر شغال)؛ الـ types اتولدت. **أعد تشغيل الباك إند** عشان يستخدم الـ client الجديد.
- الـ jobs والـ caches in-memory (instance واحد، زي 11.7). مفيش إلغاء لـ job شغال.
- Postman collection ما اتحدثش.
- الصوت من CDN خارجي: لو `cdn.islamic.network` واقع، التشغيل بيفشل برسالة + إعادة محاولة (مفيش ملفات MP3 محلية).

### 11.19 تشغيل السورة كاملة من ملف MP3 واحد · 2026-11-17
**الحالة:** اتنفذ. **مفيش اختبارات اتشغلت** (بطلب صريح)؛ typecheck + lint بس.

- **وضعين في نفس المشغّل** (`useAudioStore`، عنصر `<audio>` واحد): `session = 'ayah'` (زي 11.18 بالظبط) و`session = 'surah'` = **ملف واحد للسورة** `https://cdn.islamic.network/quran/audio-surah/{bitrate}/{folder}/{sura}.mp3`. «تشغيل السورة كاملة» **مبقاش** بيشغّل الآيات ورا بعض (`playSura` اتشال، وبقى `playFullSurah`). أي طلب جديد بيوقف القديم الأول (`halt()`) وبياخد token جديد، فمفيش تداخل بين الوضعين.
- **قائمة قرّاء منفصلة:** مصدرها `https://cdn.islamic.network/quran/info/by-surah/info.json` بس (أي فولدر `ar.*`، والـ bitrates، والسور الموجودة). اتأكدنا (2026-11-17): 159 فولدر (156 `ar.*`)، تقريباً كلهم 128kbps و114 سورة. الأسماء من `/edition?type=surahbysurah`. ⚠️ **الـ edition id مش دايماً = الفولدر** (`ar.alafasy-surah` → فولدر `ar.alafasy`، و`/audio-surah/128/ar.alafasy-surah/1.mp3` = 403)، فالـ identifier عندنا = **اسم الفولدر**، والـ edition بيتربط بيه (نفس الاسم أو من غير `-surah`) عشان الاسم بس. `ar.alafasy` موجود في القائمتين لكن كتسجيلين مختلفين، والقائمتين مش بيتخلطوا.
- **الداتا بيز (إضافة بس):** `prisma/sql/002_quran_audio_surah.sql` → جدول `audio_surah_reciters` (اتطبق على `local`). `npm run db:migrate:audio` بقى بيطبق كل `NNN_*.sql` بالترتيب (نفس الحماية: CREATE TABLE IF NOT EXISTS بس). model `AudioSurahReciter` في Prisma.
- **الـ API:**

| Method | المسار | ملاحظات |
|---|---|---|
| GET | `/quran-audio/full-surah-reciters` | `{ data: [{ identifier, name, englishName, bitrate, surahCount }], defaultReciter, source }`. من الداتا بيز لو اتعمل sync، وإلا live من الـ listing (cache 12 ساعة، ونسخة قديمة لو الـ CDN واقع) |
| GET | `/quran-audio/full-surah/:surahNumber?reciter=` | `{ reciter, sura, url, bitrate }`. 404 لقارئ مش في القائمة أو سورة مش موجودة عنده. 400 لرقم سورة برا 1–114 |
| GET | `/admin/quran-audio/surah-reciters` | الإحصائيات + القائمة + `missingSurahs` |
| POST | `/admin/quran-audio/sync/surah-reciters` | متزامن (طلبين). upsert بالفولدر، واللي اختفى → `is_available = 0` |
| PATCH | `/admin/quran-audio/surah-reciters/:identifier` | `{ isActive }` |

- **اختيار القارئ:** `surahReciter` اتضاف لـ `quran_audio` (اختياري: التفضيلات القديمة لسه بتتقري). القارئ الفعلي: المحفوظ ← نفس قارئ الآيات لو موجود في قائمة السور (بالـ identifier أو نفس الاسم العربي) ← الافتراضي (`ar.alafasy`). لو قارئ الآيات مالوش تسجيل كامل، بتظهر رسالة. القائمة بتعرض بس القرّاء اللي عندهم ملفات سور، فمفيش URL غلط.
- **الواجهة:** صفحة السورة فيها كارت فيه «قارئ الآيات» و«قارئ السورة كاملة» + «تشغيل السورة كاملة» (بيبقى إيقاف/متابعة لو السورة دي شغالة). المشغّل فيه badge «السورة كاملة»/«آية بآية»، والسورة، والقارئ، والوقت الحالي/الكلي (h:mm:ss للملفات الطويلة)، و ±10 ثانية، والسورة السابقة/التالية، و«بعد انتهاء السورة: إيقاف / السورة التالية». شيت الإعدادات فيه القائمتين. الأدمن: قسم «قرّاء السورة كاملة» في `/admin/dashboard/audio`.
- **قيود:** الـ highlight للآية مش بيشتغل في وضع السورة كاملة (مفيش توقيتات للآيات جوه الملف). الـ listing مش documented (بيتقري بحذر). الملفات كبيرة (البقرة 128kbps ≈ 120MB) بس بتتعمل لها streaming (الـ CDN بيدعم `Accept-Ranges`).
