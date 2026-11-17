import type { SearchService } from '../search.service';
import type { SearchFn } from './metrics';

/** Results scored per case: the scorer looks at the top 10 at most. */
const EVAL_LIMIT = 100;

/** The real engine (SearchService, all stages; `type` is passed through) as a golden-set SearchFn. */
export function createEngineSearch(service: Pick<SearchService, 'search'>): SearchFn {
  return (q, type) =>
    Promise.resolve(
      service
        .search(q, { limit: EVAL_LIMIT, type })
        .results.map((r) => ({ ref: r.ref, confidence: r.confidence })),
    );
}
