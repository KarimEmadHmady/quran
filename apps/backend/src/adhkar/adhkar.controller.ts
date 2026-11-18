import { Controller, Get, NotFoundException, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ADHKAR_AUDIO_MAX_AGE_SECONDS } from './adhkar.constants';
import {
  AdhkarService,
  type AdhkarCategorySummary,
  type AdhkarCategoryWithItems,
  type AdhkarItemDto,
  type AdhkarReminder,
  type AdhkarSearchResponse,
} from './adhkar.service';
import {
  AdhkarAudioParamsDto,
  AdhkarCategoryParamsDto,
  AdhkarItemParamsDto,
  AdhkarSearchQueryDto,
} from './dto/adhkar.dto';

/**
 * Public, read-only adhkar API (same conventions as /suras and /topics: strict params, unknown
 * query parameters = 400, default throttler, no authentication — public content).
 *
 *   GET /adhkar                                      every category with its items, in order
 *   GET /adhkar/categories                           categories (+ item count), in order
 *   GET /adhkar/categories/:id                       one category and its items
 *   GET /adhkar/categories/:id/items/:itemNumber     one item
 *   GET /adhkar/search?q=                            items / categories matching every word
 *   GET /adhkar/reminders                            time-of-day reminder slots
 *   GET /adhkar/audio/:file                          the MP3 (Range supported, long cache)
 *
 * No pagination: the whole set is ~270 short texts.
 */
@Controller('adhkar')
export class AdhkarController {
  constructor(private readonly adhkar: AdhkarService) {}

  @Get()
  async all(): Promise<{ data: AdhkarCategoryWithItems[] }> {
    return { data: await this.adhkar.all() };
  }

  @Get('categories')
  async categories(): Promise<{ data: AdhkarCategorySummary[] }> {
    return { data: await this.adhkar.categories() };
  }

  @Get('categories/:id')
  category(
    @Param() { id }: AdhkarCategoryParamsDto,
  ): Promise<{ category: AdhkarCategorySummary; items: AdhkarItemDto[] }> {
    return this.adhkar.category(id);
  }

  @Get('categories/:id/items/:itemNumber')
  item(
    @Param() { id, itemNumber }: AdhkarItemParamsDto,
  ): Promise<{ category: AdhkarCategorySummary; item: AdhkarItemDto }> {
    return this.adhkar.item(id, itemNumber);
  }

  @Get('search')
  search(@Query() { q }: AdhkarSearchQueryDto): Promise<AdhkarSearchResponse> {
    return this.adhkar.search(q);
  }

  @Get('reminders')
  async reminders(): Promise<{ data: AdhkarReminder[] }> {
    return { data: await this.adhkar.reminders() };
  }

  /**
   * Only files referenced by the imported data and present in the audio folder are served
   * (no directory listing, no path traversal: the name is a strict pattern and is looked up in
   * a whitelist). Express sendFile handles Range / ETag / Last-Modified for seeking and caching.
   * CORP is relaxed to cross-origin for these public files only, so the web app (another origin)
   * can play them in an <audio> element; helmet's other headers stay.
   */
  @Get('audio/:file')
  async audio(@Param() { file }: AdhkarAudioParamsDto, @Res() res: Response): Promise<void> {
    const path = await this.adhkar.audioPath(file);
    if (!path) throw new NotFoundException('Audio file not found');
    await new Promise<void>((resolveSend, rejectSend) => {
      res.sendFile(
        path,
        {
          maxAge: ADHKAR_AUDIO_MAX_AGE_SECONDS * 1000,
          immutable: true,
          dotfiles: 'deny',
          headers: {
            'Content-Type': 'audio/mpeg',
            'Cross-Origin-Resource-Policy': 'cross-origin',
          },
        },
        (err?: Error) => {
          if (!err) return resolveSend();
          // Client aborted mid-stream, or the file vanished: answer 404 only if nothing was sent.
          if (res.headersSent) {
            res.end();
            return resolveSend();
          }
          rejectSend(new NotFoundException('Audio file not found'));
        },
      );
    });
  }
}
