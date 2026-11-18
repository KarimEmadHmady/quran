# Quran App API — Guide for the Flutter app

Companion to `Flutter-Mobile-API.postman_collection.json` (same folder). Everything here was checked
against the backend source (`apps/backend/src`). Response examples in the collection were written
from the source code using real database values; they are **not** recordings of live calls.

## 1. Import the collection

1. Postman → **Import** → choose `postman/Flutter-Mobile-API.postman_collection.json`.
2. The collection appears as **"Quran App — Flutter Mobile API"** with 8 folders and 28 requests
   (25 distinct endpoints; search and topics have a few example variants).
3. No environment file is required: all variables are collection variables.

## 2. Configure `baseUrl`

Collection → **Variables** → `baseUrl` (default `http://localhost:3001`).

- No `/api` prefix: routes are at the root (`{{baseUrl}}/suras`).
- Android emulator → `http://10.0.2.2:3001`; real device → your computer's LAN IP (`http://192.168.x.x:3001`).
- No trailing slash.
- In Flutter, keep the same value in one config constant (e.g. `--dart-define=API_BASE_URL=...`).
- Plain `http://` on Android 9+ / iOS needs a cleartext / ATS exception during development.

Other variables (`surahNumber`, `ayahId`, `topicId`, `reciter`, `adhkarCategoryId`, …) are sample
values. Two requests set variables automatically:
- **Adhkar → List categories** sets `adhkarCategoryId`.
- **Adhkar → Get category with its items** sets `adhkarAudioFile`.

## 3. Authentication

**There is none for the app.** Every endpoint in the collection is public:
- no login, registration or token;
- no user profile;
- no server-side favourites, bookmarks, settings or daily-wird (khatma) progress.

The backend has no end-user accounts. The web app stores all of that on the device; the Flutter
app should do the same (e.g. `shared_preferences`, `hive`, `sqflite`).

The backend's only authentication is for the admin dashboard (an httpOnly cookie on `/admin/*`).
It is intentionally **not** in the collection and must not be used by the app.

The collection is set to **No Auth**, and there is no `token` variable because no endpoint uses one.

## 4. API groups

| Folder | Endpoints |
|---|---|
| 00 Health | `GET /health` |
| 01 Suras | `GET /suras`, `GET /suras/:number`, `GET /ayahs?ids=` |
| 02 Topics | `GET /topics[?tree=true]`, `GET /topics/:id` |
| 03 Tafsir | `GET /tafsir-books`, `GET /tafsirs?ayah_id=`, `GET /tafsirs/available?ayah_ids=` |
| 04 Quran search | `GET /search`, `GET /search/suggest` |
| 05 Quran audio | `GET /quran-audio/reciters[/:identifier]`, `/ayah/:s/:a`, `/surah/:s`, `/full-surah-reciters`, `/full-surah/:s` |
| 06 Adhkar | `GET /adhkar`, `/adhkar/categories[/:id[/items/:itemNumber]]`, `/adhkar/search`, `/adhkar/reminders`, `/adhkar/audio/:file` |
| 07 PDF export | `POST /export/pdf` |

## 5. Important details

**Requests**
- Send `Accept: application/json`. The only request with a body is `POST /export/pdf`, which needs
  `Content-Type: application/json`.
- On endpoints that declare query parameters or a body, any **unknown parameter or field = 400**.
- Integers must be plain digits: `1.5`, `1e2`, `-1`, or the same parameter twice = 400.
- Lists are comma-separated in ONE parameter: `ids=1,2,255`.

**Ayahs**
- Every ayah has the same shape: `{ id, suraNumber, ayahNumber, textUthmani, textSimple, juz, page }`.
- `id` is the global ayah number 1..6236 in Mushaf order.
- `textUthmani` is the Mushaf script with diacritics (use it for display, with an Uthmani-capable
  font such as Amiri Quran). `textSimple` has no diacritics.

**Pagination** (only `/suras/:number`, `/topics/:id`, `/search`)
- `page` is 1-based; `limit` defaults to 50, max 100.
- The response has `pagination: { page, limit, total, totalPages }`; for `/search` the same fields
  are at the top level.

**Search**
- `q`: non-blank, ≤ 200 characters, ≤ 20 words.
- It accepts text with typos, references (`2:255`, `البقرة 255`, `سورة الكهف`) and Arabic-Indic digits.
- Voice: `type=voice` + `alts=a|b|c` (other speech-to-text transcripts joined by `|`, max 5).
- `highlights[]` are UTF-16 ranges into `textUthmani`. Dart strings are UTF-16, so
  `text.substring(start, end)` gives the highlighted part.
- Show `corrected` ("searched for X instead of Y") and `didYouMean` when present.
- When the first result has `confidence: "low"`, treat the results as suggestions.

**Topics and tafsir**
- Banned topics are never returned.
- Tafsir `content` can be very long and may contain line breaks.
- Use `/tafsirs/available` to know which ayahs have a tafsir before showing a button.

**Adhkar**
- An item's stable key is `(categoryId, number)`; `number` restarts at 1 in each category.
- Display `text` exactly as received.
- `repeatCount` is how many times the dhikr is said; counters are kept on the device.
- Morning and evening adhkar are the same category (id 1).
- `GET /adhkar` returns everything (~270 texts) for offline caching.

**Reminders**
- `GET /adhkar/reminders` gives the 4 time slots (morning, evening, sleep, wake) with a category
  and a default local time `"HH:MM"`.
- The backend does **not** send notifications. Schedule local notifications on the device and
  open the given `categoryId` when tapped.

**Text and dates**
- Text is UTF-8 JSON; Arabic needs no special decoding (`jsonDecode(utf8.decode(res.bodyBytes))`
  if your client does not decode UTF-8 by default).
- Percent-encode Arabic in query strings (Dart's `Uri(queryParameters: …)` does it).
- Timestamps (only in error bodies) are ISO-8601 UTC strings.

**PDF export**
- `POST /export/pdf` with `{ "items": [{ "ayahId": 1, "tafsirBookId": 1 }, { "ayahId": 2 }] }`
  (1..100 items, printed in that order).
- Returns PDF bytes (`application/pdf`); save them to a file and open or share it.
- `tafsirBookId` must be a book from `/tafsir-books`.

## 6. Audio

There are two different kinds of audio URL:

| Source | What the API returns | How to play |
|---|---|---|
| Quran recitation (`/quran-audio/*`) | **Absolute** URL on a third-party CDN, e.g. `https://cdn.islamic.network/quran/audio/128/ar.alafasy/1.mp3` | Play it as is. If it fails, try `fallbackUrls` in order. A track with `url: null` has no recording: skip it. |
| Adhkar (`audioUrl` in `/adhkar/*`) | **Relative** path, e.g. `/adhkar/audio/75.mp3`, or `null` | Play `baseUrl + audioUrl` (`http://10.0.2.2:3001/adhkar/audio/75.mp3`). |

- **Two reciter lists:**
  - verse-by-verse reciters (one MP3 per ayah): `/quran-audio/reciters`;
  - full-sura reciters (one MP3 per sura): `/quran-audio/full-surah-reciters`.
  - Don't mix identifiers between the two lists. Omitting `reciter` uses the server default.
- **Full-sura files are large** (long suras can be over 100 MB). Stream them (e.g. `just_audio`
  with a URL source); don't download them first. Both the CDN and the adhkar endpoint support
  HTTP Range for seeking.
- **Caching:** adhkar MP3s are served as `audio/mpeg` with a 30-day immutable cache and ETag, so a
  caching audio source works well.
- **Errors:** unknown adhkar file names return 404 (JSON error body).

## 7. Errors

Every error uses one JSON shape:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Validation failed",
  "details": ["q must not be blank"],
  "requestId": "3f2b6c1e-…",
  "path": "/search",
  "timestamp": "2026-11-18T10:00:00.000Z"
}
```

- `details` is present for validation errors only.
- Show `message` / `details` in debug builds, but use your own Arabic messages in the UI.
- Log `requestId` (also sent as the `X-Request-Id` response header) to help backend debugging.

| Status | Meaning |
|---|---|
| 400 | Invalid parameters or body (see `details`) |
| 404 | Not found (sura, topic, ayah, reciter recording, adhkar category/item/file) |
| 413 / 414 | Body / URL too large |
| 429 | Rate limited: wait `Retry-After` seconds |
| 503 | Temporarily unavailable: search index still building after a restart (`/health` → `searchReady`), adhkar tables missing on that server, reciter list unavailable, or no browser for PDF export |
| 500 | Unexpected server error (generic message in production) |

## 8. Limits and mobile notes

- **Rate limits** per client IP (default server config): 100 requests/min on all routes, plus
  30/min on `/search` and 10/min on `/export/pdf`.
  - Debounce search and suggest (≈200 ms).
  - Don't call `/search` on every keystroke; use `/search/suggest` while typing.
- **Search after a restart:** `/search` and `/search/suggest` return 503 for a few seconds after
  the server starts. Retry after a short delay or check `GET /health` → `searchReady`.
- **CORS** only matters for **Flutter Web**: its origin must be added to the backend's
  `WEB_ORIGIN`. Native Android/iOS apps are not affected.
- **No user data on the server:** favourites, bookmarks, last position, reading settings,
  reminders, adhkar counters and the daily-wird plan all live on the device.
- **Content can change on the server** (sura names, topics, adhkar). Cache it with a sensible
  refresh rather than bundling it permanently.
