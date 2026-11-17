-- Full-sura audio (one MP3 per sura) — ADDITIVE migration.
--
-- Creates ONE new table. Nothing existing is altered (not even the 001 audio tables).
-- `CREATE TABLE IF NOT EXISTS`, so running it again is a no-op.
--
-- Apply with (from the repo root):   npm run db:migrate:audio
-- Roll back:                          DROP TABLE audio_surah_reciters;

-- Reciters that have a complete-sura recording on the CDN
-- (https://cdn.islamic.network/quran/audio-surah/{bitrate}/{identifier}/{sura}.mp3).
-- This list is SEPARATE from audio_reciters (verse-by-verse): the two catalogues use different
-- folders on the CDN, and the same identifier can exist in both for different recordings.
-- `identifier` is the CDN folder name (what URLs are built from); `api_identifier` is the
-- matching AlQuran Cloud "surahbysurah" edition when one exists (only used for the name).
CREATE TABLE IF NOT EXISTS `audio_surah_reciters` (
  `id`              int UNSIGNED      NOT NULL AUTO_INCREMENT,
  `identifier`      varchar(80)       COLLATE utf8mb4_unicode_ci NOT NULL,
  `api_identifier`  varchar(80)       COLLATE utf8mb4_unicode_ci NULL,
  `name`            varchar(150)      COLLATE utf8mb4_unicode_ci NULL,
  `english_name`    varchar(150)      COLLATE utf8mb4_unicode_ci NULL,
  `language`        varchar(10)       COLLATE utf8mb4_unicode_ci NOT NULL,
  `bitrate`         smallint UNSIGNED NOT NULL,
  `bitrates`        varchar(60)       COLLATE utf8mb4_unicode_ci NOT NULL,
  `surah_count`     smallint UNSIGNED NOT NULL,
  `missing_surahs`  varchar(500)      COLLATE utf8mb4_unicode_ci NULL,
  `is_available`    tinyint(1)        NOT NULL DEFAULT 1,
  `is_active`       tinyint(1)        NOT NULL DEFAULT 1,
  `last_synced_at`  timestamp         NULL DEFAULT NULL,
  `created_at`      timestamp         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      timestamp         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_surah_reciter_identifier` (`identifier`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
