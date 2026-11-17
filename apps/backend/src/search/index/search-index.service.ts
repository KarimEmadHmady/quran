import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { CorpusLoader, type CorpusAyah } from './corpus-loader.service';
import { AlignmentMap, type AlignmentStats } from './alignment-map';
import { InvertedIndex, type IndexStats } from './inverted-index';
import { SuraCatalog, type SuraInfo } from '../query/sura-catalog';

export interface SearchSnapshot {
  index: InvertedIndex;
  alignment: AlignmentMap;
  suras: SuraCatalog;
  /** text_uthmani per doc (index order), for result display without a DB round trip. */
  uthmani: readonly string[];
}

/**
 * Everything search needs from one corpus load. Throws when suras.ayah_count disagrees with
 * the indexed ayahs: a reference must never point at an ayah the index does not have.
 */
export function buildSnapshot(
  corpus: readonly CorpusAyah[],
  suraRows: readonly SuraInfo[],
): SearchSnapshot {
  const index = InvertedIndex.build(corpus);
  return {
    index,
    alignment: AlignmentMap.build(corpus),
    suras: SuraCatalog.build(suraRows, index.ayahCountsBySura()),
    uthmani: corpus.map((d) => d.textUthmani),
  };
}

export type SearchIndexState = 'idle' | 'building' | 'ready' | 'failed';

export interface SearchIndexStatus {
  /** State of the most recent build. */
  state: SearchIndexState;
  /** True while a usable index is loaded (also during a rebuild, or after a failed rebuild). */
  ready: boolean;
  stats?: IndexStats;
  alignment?: AlignmentStats;
  builtAt?: string;
  buildMs?: number;
}

/**
 * Owns the in-memory index (claude.md 5.4 / 5.11): built once after startup without blocking
 * it, rebuilt on demand (future POST /admin/search/reindex) with an atomic swap, so readers
 * never see a half-built index.
 */
@Injectable()
export class SearchIndexService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SearchIndexService.name);
  /** Index + alignment + suras are swapped together so they always describe the same corpus. */
  private snapshot: SearchSnapshot | null = null;
  private state: SearchIndexState = 'idle';
  private building: Promise<InvertedIndex> | null = null;
  private builtAt?: Date;
  private buildMs?: number;

  constructor(
    private readonly loader: CorpusLoader,
    private readonly now: () => number = () => performance.now(),
  ) {}

  onApplicationBootstrap(): void {
    // Not awaited: the API (reading endpoints, /health) is usable while the index builds.
    // Failures are logged in rebuild() and reflected in status(); nothing is thrown here.
    this.rebuild().catch(() => undefined);
  }

  /** The current index, or null before the first successful build. */
  current(): InvertedIndex | null {
    return this.snapshot?.index ?? null;
  }

  /** Word alignment for highlighting (same doc order as the index), or null before the first build. */
  currentAlignment(): AlignmentMap | null {
    return this.snapshot?.alignment ?? null;
  }

  /** Index, alignment and sura catalog of one build (never mixed across builds), or null. */
  currentSnapshot(): SearchSnapshot | null {
    return this.snapshot;
  }

  get isReady(): boolean {
    return this.snapshot !== null;
  }

  status(): SearchIndexStatus {
    return {
      state: this.state,
      ready: this.isReady,
      ...(this.snapshot && {
        stats: this.snapshot.index.stats(),
        alignment: this.snapshot.alignment.stats(),
        builtAt: this.builtAt?.toISOString(),
        buildMs: this.buildMs,
      }),
    };
  }

  /** Builds a fresh index and swaps it in. Concurrent calls share one build. */
  rebuild(): Promise<InvertedIndex> {
    this.building ??= this.build().finally(() => {
      this.building = null;
    });
    return this.building;
  }

  private async build(): Promise<InvertedIndex> {
    this.state = 'building';
    const started = this.now();
    try {
      const corpus = await this.loader.load();
      const suraRows = await this.loader.loadSuras();
      const snapshot = buildSnapshot(corpus, suraRows);
      const { index, alignment } = snapshot;
      this.snapshot = snapshot; // atomic swap of everything
      this.state = 'ready';
      this.builtAt = new Date();
      this.buildMs = Math.round(this.now() - started);
      const s = index.stats();
      this.logger.log(
        `Search index ready: ${s.docs} ayahs, ${s.terms} terms, ${s.tokens} tokens in ${this.buildMs}ms`,
      );
      const a = alignment.stats();
      if (a.fallback > 0 || a.invalid > 0) {
        this.logger.warn(
          `Highlight alignment degraded: ${a.fallback} ayahs fell back to whole-ayah ranges, ${a.invalid} invalid`,
        );
      }
      return index;
    } catch (err) {
      this.state = 'failed';
      // Message only: never dump objects that might carry connection details.
      const message = err instanceof Error ? err.message : 'unknown error';
      this.logger.error(
        `Search index build failed${this.snapshot ? ' (keeping the previous index)' : ''}: ${message}`,
      );
      throw err;
    }
  }
}
