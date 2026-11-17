import { Module } from '@nestjs/common';
import { CorpusLoader } from './index/corpus-loader.service';
import { SearchIndexService } from './index/search-index.service';
import { AdminSearchController } from './admin-search.controller';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

/**
 * Search engine (claude.md 5). S2: corpus loading + inverted index + vocabulary/IDF.
 * S3: highlight alignment. S4: reference search (stage 0) + SearchService orchestration.
 * S5: stages 2-3 + ranking + GET /search.
 * Phase 3: token corrector (stages 4 / 6) + did-you-mean; LRU cache, GET /search/suggest,
 * POST /admin/search/reindex (claude.md 5.11).
 */
@Module({
  controllers: [SearchController, AdminSearchController],
  providers: [
    CorpusLoader,
    {
      provide: SearchIndexService,
      inject: [CorpusLoader],
      useFactory: (loader: CorpusLoader) => new SearchIndexService(loader),
    },
    SearchService,
  ],
  exports: [SearchIndexService, SearchService],
})
export class SearchModule {}
