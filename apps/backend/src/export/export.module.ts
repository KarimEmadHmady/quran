import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvVars } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';
import { PdfRendererService } from './pdf-renderer.service';

/** Phase 5: cart -> PDF (spec 4.1, claude.md 7). */
@Module({
  controllers: [ExportController],
  providers: [
    {
      provide: PdfRendererService,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvVars, true>) => new PdfRendererService(config),
    },
    {
      provide: ExportService,
      inject: [PrismaService, PdfRendererService],
      useFactory: (prisma: PrismaService, renderer: PdfRendererService) =>
        new ExportService(prisma, renderer),
    },
  ],
})
export class ExportModule {}
