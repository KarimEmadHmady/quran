import { Module } from '@nestjs/common';
import { AdhkarController } from './adhkar.controller';
import { AdhkarService } from './adhkar.service';

/**
 * Adhkar (Hisn al-Muslim): read-only content from adhkar_categories / adhkar_items
 * (prisma/sql/003_adhkar.sql, filled by `npm run db:import:adhkar`) and the MP3 files of
 * apps/backend/audio-adhkar. Never touches the Quran tables.
 */
@Module({
  controllers: [AdhkarController],
  providers: [AdhkarService],
})
export class AdhkarModule {}
