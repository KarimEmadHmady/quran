import { Controller, Get, Query } from '@nestjs/common';
import { TafsirAvailabilityQueryDto, TafsirsQueryDto } from './dto/tafsirs-query.dto';
import { TafsirsService, type PublicTafsir, type PublicTafsirBook } from './tafsirs.service';

@Controller()
export class TafsirsController {
  constructor(private readonly tafsirs: TafsirsService) {}

  @Get('tafsir-books')
  async listBooks(): Promise<{ data: PublicTafsirBook[] }> {
    return { data: await this.tafsirs.listBooks() };
  }

  /**
   * Which of these ayahs have a tafsir in a visible book (no content is read). Lets a page of
   * search results show a «تفسير» button only where there is something to show, in ONE request.
   */
  @Get('tafsirs/available')
  async available(@Query() { ayah_ids }: TafsirAvailabilityQueryDto): Promise<{ data: number[] }> {
    return { data: await this.tafsirs.availableFor(ayah_ids) };
  }

  @Get('tafsirs')
  async forAyah(
    @Query() { ayah_id, book_ids }: TafsirsQueryDto,
  ): Promise<{ ayahId: number; data: PublicTafsir[] }> {
    return { ayahId: ayah_id, data: await this.tafsirs.forAyah(ayah_id, book_ids) };
  }
}
