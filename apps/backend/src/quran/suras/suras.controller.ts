import { Controller, Get, Param, Query } from '@nestjs/common';
import { PaginationQueryDto } from '../../common/pagination/pagination';
import { SuraParamsDto } from './dto/sura-params.dto';
import { SurasService, type PublicSura, type SuraWithAyahs } from './suras.service';

@Controller('suras')
export class SurasController {
  constructor(private readonly suras: SurasService) {}

  @Get()
  async list(): Promise<{ data: PublicSura[] }> {
    return { data: await this.suras.list() };
  }

  @Get(':number')
  findOne(
    @Param() { number }: SuraParamsDto,
    @Query() paging: PaginationQueryDto,
  ): Promise<SuraWithAyahs> {
    return this.suras.findOne(number, paging);
  }
}
