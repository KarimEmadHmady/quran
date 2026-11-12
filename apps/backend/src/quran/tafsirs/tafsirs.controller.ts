import { Controller, Get, Query } from '@nestjs/common';
import { TafsirsQueryDto } from './dto/tafsirs-query.dto';
import { TafsirsService, type PublicTafsir, type PublicTafsirBook } from './tafsirs.service';

@Controller()
export class TafsirsController {
  constructor(private readonly tafsirs: TafsirsService) {}

  @Get('tafsir-books')
  async listBooks(): Promise<{ data: PublicTafsirBook[] }> {
    return { data: await this.tafsirs.listBooks() };
  }

  @Get('tafsirs')
  async forAyah(
    @Query() { ayah_id, book_ids }: TafsirsQueryDto,
  ): Promise<{ ayahId: number; data: PublicTafsir[] }> {
    return { ayahId: ayah_id, data: await this.tafsirs.forAyah(ayah_id, book_ids) };
  }
}
