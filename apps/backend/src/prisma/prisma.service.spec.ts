import { Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import type { EnvVars } from '../config/env.validation';
import { PrismaModule } from './prisma.module';
import { PrismaService } from './prisma.service';

const SECRET_URL = 'mysql://user:very-secret-pw@db.internal:3306/quran';

describe('PrismaService', () => {
  let connectSpy: jest.SpyInstance;
  let disconnectSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    // Mock the client's network methods: unit tests never touch a real database.
    connectSpy = jest.spyOn(PrismaClient.prototype, '$connect').mockResolvedValue(undefined);
    disconnectSpy = jest.spyOn(PrismaClient.prototype, '$disconnect').mockResolvedValue(undefined);
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  function makeService(): { service: PrismaService; getSpy: jest.SpyInstance } {
    const config = new ConfigService<EnvVars, true>({ DATABASE_URL: SECRET_URL });
    const getSpy = jest.spyOn(config, 'get');
    return { service: new PrismaService(config), getSpy };
  }

  it('reads DATABASE_URL from the validated config', () => {
    const { getSpy } = makeService();
    expect(getSpy).toHaveBeenCalledWith('DATABASE_URL', { infer: true });
  });

  it('connects on module init', async () => {
    const { service } = makeService();
    await service.onModuleInit();
    expect(connectSpy).toHaveBeenCalledTimes(1);
  });

  it('disconnects on module destroy (graceful shutdown)', async () => {
    const { service } = makeService();
    await service.onModuleDestroy();
    expect(disconnectSpy).toHaveBeenCalledTimes(1);
  });

  it('propagates connection errors so startup fails fast', async () => {
    connectSpy.mockRejectedValueOnce(new Error('Cannot reach database server'));
    const { service } = makeService();
    await expect(service.onModuleInit()).rejects.toThrow('Cannot reach database server');
  });

  it('never logs the connection URL or password', async () => {
    const { service } = makeService();
    await service.onModuleInit();
    await service.onModuleDestroy();
    const logged = JSON.stringify(logSpy.mock.calls);
    expect(logSpy).toHaveBeenCalled();
    expect(logged).not.toContain('very-secret-pw');
    expect(logged).not.toContain(SECRET_URL);
  });

  it('is a singleton when resolved through the global PrismaModule', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ DATABASE_URL: SECRET_URL })],
        }),
        PrismaModule,
      ],
    }).compile();
    const a = moduleRef.get(PrismaService);
    const b = moduleRef.get(PrismaService);
    expect(a).toBe(b);
    // PrismaClient's constructor returns a proxy, so `instanceof` is unreliable; assert
    // behaviour instead: Nest lifecycle hooks plus generated model delegates (clean names).
    expect(typeof a.onModuleInit).toBe('function');
    expect(typeof a.onModuleDestroy).toBe('function');
    expect(typeof a.sura.count).toBe('function');
    expect(typeof a.category.findMany).toBe('function');
  });
});
