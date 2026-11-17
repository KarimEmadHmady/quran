import { Controller, Get, Query } from '@nestjs/common';
import { RateLimit } from '../common/throttling/rate-limit.decorator';
import { SearchQueryDto, SuggestQueryDto } from './dto/search-query.dto';
import {
  SearchService,
  type SearchOutcome,
  type SearchResultItem,
  type SuggestOutcome,
} from './search.service';

/** Public result: the engine's internal word positions are not exposed (highlights are). */
export type PublicSearchResult = Omit<SearchResultItem, 'matchedWords'>;
export type SearchResponse = Omit<SearchOutcome, 'results'> & { results: PublicSearchResult[] };

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  /** 503 until the index is built (claude.md 5.11); 400 for invalid input. */
  @Get()
  @RateLimit('search') // the most expensive endpoint (claude.md 3)
  search(@Query() { q, page, limit, type, alts }: SearchQueryDto): SearchResponse {
    const out = this.searchService.search(q, { page, limit, type, alts });
    return { ...out, results: out.results.map(toPublic) };
  }

  /**
   * Typing suggestions (claude.md 5.11): called on every (debounced) keystroke and much
   * cheaper than /search, so only the global `default` limit applies.
   */
  @Get('suggest')
  suggest(@Query() { q }: SuggestQueryDto): SuggestOutcome {
    return this.searchService.suggest(q);
  }
}

function toPublic(r: SearchResultItem): PublicSearchResult {
  const copy: Partial<SearchResultItem> = { ...r };
  delete copy.matchedWords;
  return copy as PublicSearchResult;
}
