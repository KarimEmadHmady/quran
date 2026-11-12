import { Controller, Get, Param, Query } from '@nestjs/common';
import { PaginationQueryDto } from '../../common/pagination/pagination';
import { TopicParamsDto, TopicsQueryDto } from './dto/topics.dto';
import type { PublicTopic, TopicNode } from './topic-tree';
import { TopicsService, type TopicWithAyahs } from './topics.service';

@Controller('topics')
export class TopicsController {
  constructor(private readonly topics: TopicsService) {}

  @Get()
  async list(@Query() { tree }: TopicsQueryDto): Promise<{ data: PublicTopic[] | TopicNode[] }> {
    return { data: tree ? await this.topics.tree() : await this.topics.list() };
  }

  @Get(':id')
  findOne(
    @Param() { id }: TopicParamsDto,
    @Query() paging: PaginationQueryDto,
  ): Promise<TopicWithAyahs> {
    return this.topics.findOne(id, paging);
  }
}
