import { Body, Controller, HttpCode, Post, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { RateLimit } from '../common/throttling/rate-limit.decorator';
import { ExportPdfDto } from './dto/export-pdf.dto';
import { ExportService } from './export.service';

export const PDF_FILENAME = 'quran-selection.pdf';

@Controller('export')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  /**
   * POST /export/pdf (spec 4.1) — body `{ items: { ayahId; tafsirBookId? }[] }` (1..100).
   * 200 application/pdf (attachment); 400 invalid body or unavailable tafsir book;
   * 404 unknown ayah; 503 when no browser is available; `export` throttler (10/min/IP).
   */
  @Post('pdf')
  @HttpCode(200)
  @RateLimit('export')
  async pdf(
    @Body() { items }: ExportPdfDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const pdf = await this.exportService.pdf(items);
    res.setHeader('Cache-Control', 'no-store');
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: `attachment; filename="${PDF_FILENAME}"`,
      length: pdf.length,
    });
  }
}
