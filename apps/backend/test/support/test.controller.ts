import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { RateLimit } from '../../src/common/throttling/rate-limit.decorator';

export class EchoDto {
  @IsString()
  @MaxLength(500)
  text!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  count?: number;
}

/** Test-only routes used by e2e specs. Never imported by the application. */
@Controller('__test')
export class TestController {
  @Post('echo')
  echo(@Body() dto: EchoDto): EchoDto {
    return dto;
  }

  @Get('big')
  big(): { items: { i: number; text: string }[] } {
    return { items: Array.from({ length: 500 }, (_, i) => ({ i, text: 'lorem ipsum dolor' })) };
  }

  @Get('boom')
  boom(): never {
    throw new Error('secret internal detail');
  }

  @Get('search')
  @RateLimit('search')
  search(): { ok: true } {
    return { ok: true };
  }
}
