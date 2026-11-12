import type { Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { setupApp } from '../../src/bootstrap/setup-app';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Builds the app exactly like main.ts (same setupApp, bodyParser disabled), with Prisma
 * stubbed so e2e tests never touch a real database. Extra controllers can be mounted.
 */
export async function createTestApp(
  controllers: Type[] = [],
  prismaStub: Record<string, unknown> = {},
): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule], controllers })
    .overrideProvider(PrismaService)
    .useValue({ onModuleInit: jest.fn(), onModuleDestroy: jest.fn(), ...prismaStub })
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
    logger: false,
  });
  setupApp(app);
  await app.init();
  return app;
}
