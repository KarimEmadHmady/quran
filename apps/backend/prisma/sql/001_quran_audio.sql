-- Quran audio (AlQuran Cloud) — ADDITIVE migration.
--
-- Creates three NEW tables only. It never alters, drops, truncates or writes to an existing
-- table (suras, ayahs, categories, tafsirs, admins ... are untouched). Every statement is
-- `CREATE TABLE IF NOT EXISTS`, so running it again is a no-op.
--
-- Apply with (from the repo root):   npm run db:migrate:audio
-- Roll back (only if you really want to remove the feature's data):
--   DROP TABLE ayah_audio; DROP TABLE audio_sync_jobs; DROP TABLE audio_reciters;

-- One row per AlQuran Cloud audio edition (reciter). `identifier` is the edition id, e.g.
-- "ar.alafasy". `bitrate` is only set once the edition's CDN URL pattern has been verified
-- against the API (see QuranAudio reciter sync); NULL = not verified, never used for templates.
CREATE TABLE IF NOT EXISTS `audio_reciters` (
  `id`                 int UNSIGNED      NOT NULL AUTO_INCREMENT,
  `identifier`         varchar(64)       COLLATE utf8mb4_unicode_ci NOT NULL,
  `name`               varchar(150)      COLLATE utf8mb4_unicode_ci NOT NULL,
  `english_name`       varchar(150)      COLLATE utf8mb4_unicode_ci NULL,
  `language`           varchar(10)       COLLATE utf8mb4_unicode_ci NOT NULL,
  `format`             varchar(20)       COLLATE utf8mb4_unicode_ci NOT NULL,
  `type`               varchar(30)       COLLATE utf8mb4_unicode_ci NOT NULL,
  `bitrate`            smallint UNSIGNED NULL,
  `secondary_bitrates` varchar(60)       COLLATE utf8mb4_unicode_ci NULL,
  `is_available`       tinyint(1)        NOT NULL DEFAULT 1,
  `is_active`          tinyint(1)        NOT NULL DEFAULT 1,
  `verified_at`        timestamp         NULL DEFAULT NULL,
  `verification_error` varchar(255)      COLLATE utf8mb4_unicode_ci NULL,
  `last_synced_at`     timestamp         NULL DEFAULT NULL,
  `created_at`         timestamp         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`         timestamp         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_reciter_identifier` (`identifier`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per (reciter, ayah): the verified audio URL, or status 'missing' when the recording
-- does not exist on the CDN. References ayahs(id) without changing the ayahs table.
CREATE TABLE IF NOT EXISTS `ayah_audio` (
  `id`            int UNSIGNED      NOT NULL AUTO_INCREMENT,
  `reciter_id`    int UNSIGNED      NOT NULL,
  `ayah_id`       int UNSIGNED      NOT NULL,
  `global_number` smallint UNSIGNED NOT NULL,
  `status`        enum('available','missing') COLLATE utf8mb4_unicode_ci NOT NULL,
  `url`           varchar(255)      COLLATE utf8mb4_unicode_ci NULL,
  `bitrate`       smallint UNSIGNED NULL,
  `source`        enum('cdn_listing','api') COLLATE utf8mb4_unicode_ci NOT NULL,
  `checked_at`    timestamp         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_reciter_ayah` (`reciter_id`, `ayah_id`),
  KEY `idx_aa_ayah` (`ayah_id`),
  KEY `idx_aa_reciter_status` (`reciter_id`, `status`),
  CONSTRAINT `fk_aa_reciter` FOREIGN KEY (`reciter_id`) REFERENCES `audio_reciters` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_aa_ayah` FOREIGN KEY (`ayah_id`) REFERENCES `ayahs` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Synchronization runs (progress, resumable cursor, recent errors). JSON kept as text.
CREATE TABLE IF NOT EXISTS `audio_sync_jobs` (
  `id`               int UNSIGNED      NOT NULL AUTO_INCREMENT,
  `kind`             enum('reciters','audio') COLLATE utf8mb4_unicode_ci NOT NULL,
  `status`           enum('running','completed','failed','interrupted') COLLATE utf8mb4_unicode_ci NOT NULL,
  `reciters_total`   smallint UNSIGNED NOT NULL DEFAULT 0,
  `reciters_done`    smallint UNSIGNED NOT NULL DEFAULT 0,
  `current_reciter`  varchar(64)       COLLATE utf8mb4_unicode_ci NULL,
  `items_total`      int UNSIGNED      NOT NULL DEFAULT 0,
  `items_done`       int UNSIGNED      NOT NULL DEFAULT 0,
  `missing_count`    int UNSIGNED      NOT NULL DEFAULT 0,
  `error_count`      int UNSIGNED      NOT NULL DEFAULT 0,
  `pending_reciters` text              COLLATE utf8mb4_unicode_ci NULL,
  `cursor_ayah_id`   int UNSIGNED      NULL,
  `errors`           text              COLLATE utf8mb4_unicode_ci NULL,
  `started_at`       timestamp         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       timestamp         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `finished_at`      timestamp         NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_job_kind_status` (`kind`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
