import { Module } from '@nestjs/common';
import { SurasController } from './suras/suras.controller';
import { SurasService } from './suras/suras.service';
import { TafsirsController } from './tafsirs/tafsirs.controller';
import { TafsirsService } from './tafsirs/tafsirs.service';
import { TopicsController } from './topics/topics.controller';
import { TopicsService } from './topics/topics.service';

@Module({
  controllers: [SurasController, TopicsController, TafsirsController],
  providers: [SurasService, TopicsService, TafsirsService],
})
export class QuranModule {}
