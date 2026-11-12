import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [HealthController] }).compile();
    controller = moduleRef.get(HealthController);
  });

  it('returns status ok with a non-negative integer uptime', () => {
    const res = controller.check();
    expect(res.status).toBe('ok');
    expect(Number.isInteger(res.uptimeSeconds)).toBe(true);
    expect(res.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });
});
