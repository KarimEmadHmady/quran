import { Controller, HttpCode, Post, ServiceUnavailableException } from '@nestjs/common';
import { SearchIndexService, type SearchIndexStatus } from './index/search-index.service';

/**
 * POST /admin/search/reindex (claude.md 3 / 5.4): rebuilds the in-memory index from MySQL
 * (read-only) and swaps it in atomically. Mounted under /admin, so the global AdminAuthGuard
 * requires the admin session cookie. Concurrent calls share one build; the result cache is
 * emptied automatically when the new snapshot is swapped in.
 */
@Controller('admin/search')
export class AdminSearchController {
  constructor(private readonly indexService: SearchIndexService) {}

  @Post('reindex')
  @HttpCode(200)
  async reindex(): Promise<SearchIndexStatus> {
    try {
      await this.indexService.rebuild();
    } catch {
      // Details are logged by SearchIndexService; never echo DB errors to the client.
      throw new ServiceUnavailableException(
        'Reindex failed; the previous search index (if any) is still being served',
      );
    }
    return this.indexService.status();
  }
}
