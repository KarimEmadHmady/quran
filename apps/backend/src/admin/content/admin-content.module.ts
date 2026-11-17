import { Module } from '@nestjs/common';
import { SearchModule } from '../../search/search.module';
import {
  AdminAyahsController,
  AdminStatsController,
  AdminSurasController,
  AdminTafsirBooksController,
  AdminTafsirsController,
  AdminTopicsController,
} from './admin-content.controller';
import { AdminContentService } from './admin-content.service';

/** Phase 6 dashboard content API (all under /admin, protected by the global AdminAuthGuard). */
@Module({
  imports: [SearchModule],
  controllers: [
    AdminStatsController,
    AdminSurasController,
    AdminTopicsController,
    AdminAyahsController,
    AdminTafsirBooksController,
    AdminTafsirsController,
  ],
  providers: [AdminContentService],
})
export class AdminContentModule {}
