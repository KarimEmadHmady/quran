import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { normalize } from '@quran/text-utils';
import type { EnvVars } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { isMissingAudioTable } from '../quran-audio/schema-guard';
import {
  ADHKAR_AUDIO_FILE,
  ADHKAR_AUDIO_ROUTE,
  ADHKAR_CACHE_TTL_MS,
  ADHKAR_SEARCH_MAX_RESULTS,
  DEFAULT_ADHKAR_AUDIO_DIR,
  REMINDER_DEFINITIONS,
  type ReminderDefinition,
} from './adhkar.constants';

export interface AdhkarCategorySummary {
  id: number;
  title: string;
  order: number;
  itemCount: number;
  /** Relative to the API base URL (e.g. "/adhkar/audio/ar_7esn_AlMoslem_by_Doors_028.mp3"), or null. */
  audioUrl: string | null;
}

export interface AdhkarItemDto {
  categoryId: number;
  /** The source item id inside its category. */
  number: number;
  order: number;
  /** Exactly as in the source. */
  text: string;
  repeatCount: number;
  audioUrl: string | null;
}

export interface AdhkarCategoryWithItems extends AdhkarCategorySummary {
  items: AdhkarItemDto[];
}

export interface AdhkarSearchResponse {
  query: { raw: string; normalized: string };
  categories: AdhkarCategorySummary[];
  items: { category: { id: number; title: string }; item: AdhkarItemDto }[];
  total: number;
  truncated: boolean;
}

export type AdhkarReminder = Omit<ReminderDefinition, 'categoryTitle'> & { categoryTitle: string };

interface Snapshot {
  categories: AdhkarCategoryWithItems[];
  byId: Map<number, AdhkarCategoryWithItems>;
  /** Normalised search keys (same normalize() as the Quran search). */
  titleKeys: Map<number, string>;
  itemKeys: { categoryId: number; index: number; key: string }[];
  /** Audio files that are referenced in the database AND exist on disk (the only ones served). */
  audioFiles: Set<string>;
  loadedAt: number;
}

/**
 * Read-only adhkar content (adhkar_categories / adhkar_items). The whole set is small
 * (~130 categories, ~270 items), so it is loaded once into memory, refreshed every few minutes
 * (it only changes through `npm run db:import:adhkar`), and every endpoint answers from memory.
 */
@Injectable()
export class AdhkarService {
  private readonly logger = new Logger(AdhkarService.name);
  readonly audioDir: string;
  private snapshot: Snapshot | null = null;
  private loading: Promise<Snapshot> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<EnvVars, true>,
  ) {
    this.audioDir = resolve(config.get('ADHKAR_AUDIO_DIR', { infer: true }) ?? DEFAULT_ADHKAR_AUDIO_DIR);
  }

  async categories(): Promise<AdhkarCategorySummary[]> {
    return (await this.load()).categories.map(summary);
  }

  async all(): Promise<AdhkarCategoryWithItems[]> {
    return (await this.load()).categories;
  }

  async category(id: number): Promise<{ category: AdhkarCategorySummary; items: AdhkarItemDto[] }> {
    const c = (await this.load()).byId.get(id);
    if (!c) throw new NotFoundException(`Adhkar category ${id} not found`);
    return { category: summary(c), items: c.items };
  }

  async item(
    id: number,
    itemNumber: number,
  ): Promise<{ category: AdhkarCategorySummary; item: AdhkarItemDto }> {
    const c = (await this.load()).byId.get(id);
    const item = c?.items.find((i) => i.number === itemNumber);
    if (!c || !item) throw new NotFoundException(`Adhkar item ${id}:${itemNumber} not found`);
    return { category: summary(c), item };
  }

  /**
   * Every word of the (normalised) query must appear in the item text or in its category title.
   * Categories whose title matches are listed separately. Results keep the source order.
   */
  async search(raw: string): Promise<AdhkarSearchResponse> {
    const snap = await this.load();
    const normalized = normalize(raw);
    const words = normalized.split(' ').filter(Boolean);
    const empty = { query: { raw, normalized }, categories: [], items: [], total: 0, truncated: false };
    if (words.length === 0) return empty;
    const matches = (key: string) => words.every((w) => key.includes(w));

    const categories = snap.categories
      .filter((c) => matches(snap.titleKeys.get(c.id) ?? ''))
      .map(summary);
    const hits = snap.itemKeys.filter(
      (k) => matches(k.key) || matches(`${snap.titleKeys.get(k.categoryId) ?? ''} ${k.key}`),
    );
    const items = hits.slice(0, ADHKAR_SEARCH_MAX_RESULTS).map((k) => {
      const c = snap.byId.get(k.categoryId)!;
      return { category: { id: c.id, title: c.title }, item: c.items[k.index] };
    });
    return {
      query: { raw, normalized },
      categories,
      items,
      total: hits.length,
      truncated: hits.length > items.length,
    };
  }

  /** Reminder slots whose category really exists (same id AND same title as the definition). */
  async reminders(): Promise<AdhkarReminder[]> {
    const snap = await this.load();
    return REMINDER_DEFINITIONS.filter((r) => {
      const c = snap.byId.get(r.categoryId);
      if (c && c.title === r.categoryTitle) return true;
      this.logger.warn(`Reminder "${r.key}": category ${r.categoryId} not found or renamed; reminder hidden`);
      return false;
    }).map((r) => ({ ...r }));
  }

  /** Absolute path of a servable audio file, or null (not referenced / missing on disk). */
  async audioPath(file: string): Promise<string | null> {
    if (!ADHKAR_AUDIO_FILE.test(file)) return null;
    const snap = await this.load();
    return snap.audioFiles.has(file) ? join(this.audioDir, file) : null;
  }

  // ------------------------------------------------------------------ loading

  private async load(): Promise<Snapshot> {
    const snap = this.snapshot;
    if (snap && Date.now() - snap.loadedAt < ADHKAR_CACHE_TTL_MS) return snap;
    if (!this.loading) {
      this.loading = this.build()
        .then((s) => (this.snapshot = s))
        .finally(() => (this.loading = null));
    }
    try {
      return await this.loading;
    } catch (err) {
      // A refresh failure keeps serving the previous snapshot.
      if (snap) return snap;
      if (isMissingAudioTable(err)) {
        throw new ServiceUnavailableException(
          'Adhkar tables are missing: run `npm run db:migrate:adhkar` and `npm run db:import:adhkar` first',
        );
      }
      this.logger.error(`Loading adhkar failed: ${err instanceof Error ? err.message : String(err)}`);
      throw new ServiceUnavailableException('Adhkar are temporarily unavailable');
    }
  }

  private async build(): Promise<Snapshot> {
    const rows = await this.prisma.adhkarCategory.findMany({
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        title: true,
        sortOrder: true,
        audioFile: true,
        items: {
          orderBy: { sortOrder: 'asc' },
          select: { itemNumber: true, sortOrder: true, text: true, repeatCount: true, audioFile: true },
        },
      },
    });

    const audioFiles = new Set<string>();
    const missing: string[] = [];
    const url = (file: string | null): string | null => {
      if (!file || !ADHKAR_AUDIO_FILE.test(file)) return null;
      if (!audioFiles.has(file)) {
        const full = join(this.audioDir, file);
        if (!existsSync(full) || !statSync(full).isFile()) {
          missing.push(file);
          return null;
        }
        audioFiles.add(file);
      }
      return `${ADHKAR_AUDIO_ROUTE}/${encodeURIComponent(file)}`;
    };

    const categories: AdhkarCategoryWithItems[] = rows.map((c) => ({
      id: c.id,
      title: c.title,
      order: c.sortOrder,
      itemCount: c.items.length,
      audioUrl: url(c.audioFile),
      items: c.items.map((i) => ({
        categoryId: c.id,
        number: i.itemNumber,
        order: i.sortOrder,
        text: i.text,
        repeatCount: i.repeatCount,
        audioUrl: url(i.audioFile),
      })),
    }));

    if (missing.length > 0) {
      this.logger.warn(
        `${missing.length} adhkar audio file(s) referenced but not found in ${this.audioDir}; served without audio`,
      );
    }
    if (categories.length === 0) this.logger.warn('No adhkar in the database: run `npm run db:import:adhkar`');

    return {
      categories,
      byId: new Map(categories.map((c) => [c.id, c])),
      titleKeys: new Map(categories.map((c) => [c.id, normalize(c.title)])),
      itemKeys: categories.flatMap((c) =>
        c.items.map((i, index) => ({ categoryId: c.id, index, key: normalize(i.text) })),
      ),
      audioFiles,
      loadedAt: Date.now(),
    };
  }
}

function summary(c: AdhkarCategoryWithItems): AdhkarCategorySummary {
  return { id: c.id, title: c.title, order: c.order, itemCount: c.itemCount, audioUrl: c.audioUrl };
}
