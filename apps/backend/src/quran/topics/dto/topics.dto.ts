import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { toStrictBoolean, toStrictInt } from '../../../common/validation/transforms';

export class TopicsQueryDto {
  @IsOptional()
  @Transform(toStrictBoolean)
  @IsBoolean()
  tree: boolean = false;
}

export class TopicParamsDto {
  @Transform(toStrictInt)
  @IsInt()
  @Min(1)
  @Max(4_294_967_295) // categories.id is INT UNSIGNED
  id!: number;
}
