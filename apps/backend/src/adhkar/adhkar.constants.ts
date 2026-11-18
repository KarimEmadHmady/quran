import { join } from 'node:path';

/**
 * Default folder of the adhkar MP3 files: <backend>/audio-adhkar. Works from src/adhkar (ts-node /
 * jest) and from dist/adhkar (nest build) alike. Override with ADHKAR_AUDIO_DIR.
 */
export const DEFAULT_ADHKAR_AUDIO_DIR = join(__dirname, '..', '..', 'audio-adhkar');

/** Public path prefix of the audio files (GET /adhkar/audio/:file). */
export const ADHKAR_AUDIO_ROUTE = '/adhkar/audio';

/** A stored audio file name ("75.mp3", "ar_7esn_AlMoslem_by_Doors_028.mp3"): no path, no dots. */
export const ADHKAR_AUDIO_FILE = /^[A-Za-z0-9_-]{1,140}\.mp3$/;

/** The content changes only through `npm run db:import:adhkar`: a short cache is enough. */
export const ADHKAR_CACHE_TTL_MS = 5 * 60_000;

/** Audio files never change under the same name. */
export const ADHKAR_AUDIO_MAX_AGE_SECONDS = 30 * 24 * 3600;

/** Search limits (same spirit as /search: bounded input, bounded output). */
export const ADHKAR_SEARCH_MAX_LENGTH = 100;
export const ADHKAR_SEARCH_MAX_RESULTS = 50;

export type ReminderKey = 'morning' | 'evening' | 'sleep' | 'wake';

export interface ReminderDefinition {
  key: ReminderKey;
  label: string;
  /** Category opened by the notification (looked up by id AND exact title, see AdhkarService). */
  categoryId: number;
  categoryTitle: string;
  /** Default local time "HH:MM" (the user can change it on the device). */
  defaultTime: string;
  /** Notification body (short). */
  message: string;
}

/**
 * Time-of-day reminders, matched to the actual source categories (adhkar.json):
 *   1 "أذكار الصباح والمساء" (ONE category holds both the morning and the evening adhkar),
 *   2 "أذكار النوم", 3 "أذكار الاستيقاظ من النوم".
 * Other categories are tied to events (prayer, travel, rain, ...), not to a clock time, so they
 * get no reminder. A definition whose category is missing from the database is not returned.
 */
export const REMINDER_DEFINITIONS: readonly ReminderDefinition[] = [
  {
    key: 'morning',
    label: 'أذكار الصباح',
    categoryId: 1,
    categoryTitle: 'أذكار الصباح والمساء',
    defaultTime: '06:30',
    message: 'حان وقت أذكار الصباح',
  },
  {
    key: 'evening',
    label: 'أذكار المساء',
    categoryId: 1,
    categoryTitle: 'أذكار الصباح والمساء',
    defaultTime: '17:30',
    message: 'حان وقت أذكار المساء',
  },
  {
    key: 'sleep',
    label: 'أذكار النوم',
    categoryId: 2,
    categoryTitle: 'أذكار النوم',
    defaultTime: '22:30',
    message: 'لا تنسَ أذكار النوم قبل أن تنام',
  },
  {
    key: 'wake',
    label: 'أذكار الاستيقاظ',
    categoryId: 3,
    categoryTitle: 'أذكار الاستيقاظ من النوم',
    defaultTime: '05:30',
    message: 'أذكار الاستيقاظ من النوم',
  },
];
