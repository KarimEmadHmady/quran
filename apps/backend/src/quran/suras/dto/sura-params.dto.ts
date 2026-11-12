import { Transform } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { toStrictInt } from '../../../common/validation/transforms';

export class SuraParamsDto {
  @Transform(toStrictInt)
  @IsInt()
  @Min(1)
  @Max(114)
  number!: number;
}
