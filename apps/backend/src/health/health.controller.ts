import { Controller, Get } from '@nestjs/common';
import { SearchIndexService } from '../search/index/search-index.service';

export interface HealthResponse {
  status: 'ok';
  uptimeSeconds: number;
  /** claude.md 5.11: false until the in-memory search index is built (reading APIs work anyway). */
  searchReady: boolean;
}

@Controller('health')
export class HealthController {
  constructor(private readonly searchIndex: SearchIndexService) {}

  @Get()
  check(): HealthResponse {
    return {
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      searchReady: this.searchIndex.isReady,
    };
  }
}
