import { BadRequestException } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { createValidationPipe } from './validation.pipe';

class QueryDto {
  @IsString()
  q!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

const meta = { type: 'query' as const, metatype: QueryDto };

describe('createValidationPipe', () => {
  const pipe = createValidationPipe();

  it('transforms into a DTO instance and converts declared types', async () => {
    const out = (await pipe.transform({ q: 'hello', limit: '20' }, meta)) as QueryDto;
    expect(out).toBeInstanceOf(QueryDto);
    expect(out.limit).toBe(20);
  });

  async function errorOf(value: unknown): Promise<BadRequestException> {
    try {
      await pipe.transform(value, meta);
    } catch (e) {
      return e as BadRequestException;
    }
    throw new Error('expected validation to fail');
  }

  it('rejects unknown properties (forbidNonWhitelisted)', async () => {
    const err = await errorOf({ q: 'x', isAdmin: true });
    expect(err).toBeInstanceOf(BadRequestException);
    expect(JSON.stringify(err.getResponse())).toContain('property isAdmin should not exist');
  });

  it('rejects invalid values with readable messages and does not echo the value', async () => {
    const err = await errorOf({ q: 'x', limit: '1000' });
    const response = JSON.stringify(err.getResponse());
    expect(response).toContain('limit must not be greater than 100');
    expect(response).not.toContain('"value"');
  });

  it('rejects missing required fields', async () => {
    const err = await errorOf({});
    expect(JSON.stringify(err.getResponse())).toContain('q must be a string');
  });
});
