import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { requestIdMiddleware } from '../common/http/request-id.middleware';
import { setupApp } from './setup-app';

describe('setupApp', () => {
  function run(trustProxy: boolean | number | string) {
    const config = new ConfigService({
      TRUST_PROXY: trustProxy,
      MAX_URL_LENGTH: 8192,
      WEB_ORIGIN: ['http://localhost:3000'],
      BODY_LIMIT: '100kb',
    });
    const app = {
      get: jest.fn().mockReturnValue(config),
      set: jest.fn(),
      disable: jest.fn(),
      use: jest.fn<void, [unknown]>(),
      enableCors: jest.fn(),
      useBodyParser: jest.fn(),
      enableShutdownHooks: jest.fn(),
    };
    setupApp(app as unknown as NestExpressApplication);
    return app;
  }

  it('sets trust proxy from config', () => {
    expect(run(1).set).toHaveBeenCalledWith('trust proxy', 1);
    expect(run(false).set).toHaveBeenCalledWith('trust proxy', false);
  });

  it('registers request id first, then logger, url guard, helmet, compression, cookies', () => {
    const app = run(false);
    expect(app.use).toHaveBeenCalledTimes(6);
    expect(app.use.mock.calls[0][0]).toBe(requestIdMiddleware);
    expect(app.disable).toHaveBeenCalledWith('x-powered-by');
  });

  it('enables strict CORS, the size-limited JSON parser and shutdown hooks', () => {
    const app = run(false);
    expect(app.enableCors).toHaveBeenCalledWith(expect.objectContaining({ credentials: true }));
    expect(app.useBodyParser).toHaveBeenCalledWith('json', { limit: '100kb' });
    expect(app.enableShutdownHooks).toHaveBeenCalled();
  });
});
