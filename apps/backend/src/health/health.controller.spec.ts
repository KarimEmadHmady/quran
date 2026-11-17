import { Test } from '@nestjs/testing';
import { SearchIndexService } from '../search/index/search-index.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  async function make(isReady: boolean) {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: SearchIndexService, useValue: { isReady } }],
    }).compile();
    return moduleRef.get(HealthController);
  }

  it('returns status ok with a non-negative integer uptime', async () => {
    const res = (await make(false)).check();
    expect(res.status).toBe('ok');
    expect(Number.isInteger(res.uptimeSeconds)).toBe(true);
    expect(res.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('reports searchReady from the search index', async () => {
    expect((await make(false)).check().searchReady).toBe(false);
    expect((await make(true)).check().searchReady).toBe(true);
  });
});
