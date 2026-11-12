import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import type { EnvVars } from '../config/env.validation';

/**
 * Single shared Prisma client for the whole app (provided once by the global PrismaModule).
 * Connects eagerly on startup so a bad DATABASE_URL fails fast, and disconnects on shutdown
 * (main.ts enables shutdown hooks). The connection URL is never logged.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService<EnvVars, true>) {
    super({
      datasourceUrl: config.get('DATABASE_URL', { infer: true }),
      log: ['warn', 'error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Database connection established');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Database connection closed');
  }
}
