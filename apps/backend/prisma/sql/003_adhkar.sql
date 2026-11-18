-- Adhkar (Hisn al-Muslim) — ADDITIVE migration.
--
-- Creates TWO new tables. Nothing existing is altered (no Quran / tafsir / audio table).
-- `CREATE TABLE IF NOT EXISTS`, so running it again is a no-op.
--
-- Apply with (from the repo root):   npm run db:migrate:adhkar     (same runner as the audio ones)
-- Fill / refresh with:               npm run db:import:adhkar      (apps/backend/adhkar.json)
-- Roll back:                          DROP TABLE adhkar_items; DROP TABLE adhkar_categories;
--
-- Source: apps/backend/adhkar.json = an array of categories { id, category, audio, filename,
-- array: [{ id, text, count, audio, filename }] }. Item ids restart at 1 in every category, so
-- an item is identified by (category_id, item_number). Audio files live on disk in
-- apps/backend/audio-adhkar/ and are served by GET /adhkar/audio/:file — only the FILE NAME is
-- stored here (never MP3 data). Source "/audio/75.mp3" -> audio_file "75.mp3".

CREATE TABLE IF NOT EXISTS `adhkar_categories` (
  -- = the source category id (kept as is, not auto-generated)
  `id`          smallint UNSIGNED NOT NULL,
  -- Arabic title, stored exactly as in the source
  `title`       varchar(255)      COLLATE utf8mb4_unicode_ci NOT NULL,
  -- 1-based position in the source array (display order)
  `sort_order`  smallint UNSIGNED NOT NULL,
  -- whole-category recording, e.g. "ar_7esn_AlMoslem_by_Doors_028.mp3"; NULL = none / file missing
  `audio_file`  varchar(150)      COLLATE utf8mb4_unicode_ci NULL,
  `created_at`  timestamp         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  timestamp         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_adhkar_categories_sort` (`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `adhkar_items` (
  `id`            int UNSIGNED      NOT NULL AUTO_INCREMENT,
  `category_id`   smallint UNSIGNED NOT NULL,
  -- = the source item id inside its category (1..n)
  `item_number`   smallint UNSIGNED NOT NULL,
  -- 1-based position inside the category's source array (display order)
  `sort_order`    smallint UNSIGNED NOT NULL,
  -- the supplication, stored exactly as in the source (diacritics, punctuation, brackets)
  `text`          text              COLLATE utf8mb4_unicode_ci NOT NULL,
  -- required repetitions (source "count")
  `repeat_count`  smallint UNSIGNED NOT NULL,
  -- per-item recording, e.g. "75.mp3"; NULL = none / file missing
  `audio_file`    varchar(150)      COLLATE utf8mb4_unicode_ci NULL,
  `created_at`    timestamp         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    timestamp         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_adhkar_items_number` (`category_id`, `item_number`),
  UNIQUE KEY `uq_adhkar_items_sort` (`category_id`, `sort_order`),
  CONSTRAINT `chk_adhkar_items_repeat` CHECK (`repeat_count` >= 1),
  CONSTRAINT `fk_adhkar_items_category` FOREIGN KEY (`category_id`)
    REFERENCES `adhkar_categories` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
