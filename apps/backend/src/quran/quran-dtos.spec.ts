import type { Type } from '@nestjs/common';
import { createValidationPipe } from '../common/validation/validation.pipe';
import { SuraParamsDto } from './suras/dto/sura-params.dto';
import { TafsirsQueryDto } from './tafsirs/dto/tafsirs-query.dto';
import { TopicParamsDto, TopicsQueryDto } from './topics/dto/topics.dto';

const pipe = createValidationPipe();
function parse<T>(metatype: Type<T>, value: Record<string, unknown>, type: 'query' | 'param') {
  return pipe.transform(value, { type, metatype }) as Promise<T>;
}
const bad = { status: 400 };

describe('SuraParamsDto', () => {
  it.each([
    ['1', 1],
    ['114', 114],
  ])('accepts %p', async (n, out) => {
    await expect(parse(SuraParamsDto, { number: n }, 'param')).resolves.toEqual({ number: out });
  });

  it.each(['0', '115', 'abc', '1.5', '-1', '1e1', ''])('rejects %p', async (n) => {
    await expect(parse(SuraParamsDto, { number: n }, 'param')).rejects.toMatchObject(bad);
  });
});

describe('TopicsQueryDto', () => {
  it('defaults tree to false and accepts true/false', async () => {
    await expect(parse(TopicsQueryDto, {}, 'query')).resolves.toEqual({ tree: false });
    await expect(parse(TopicsQueryDto, { tree: 'true' }, 'query')).resolves.toEqual({ tree: true });
    await expect(parse(TopicsQueryDto, { tree: 'false' }, 'query')).resolves.toEqual({
      tree: false,
    });
  });

  it.each(['1', 'yes', 'TRUE', ''])('rejects tree=%p', async (v) => {
    await expect(parse(TopicsQueryDto, { tree: v }, 'query')).rejects.toMatchObject(bad);
  });

  it('rejects unknown query params', async () => {
    await expect(parse(TopicsQueryDto, { foo: '1' }, 'query')).rejects.toMatchObject(bad);
  });
});

describe('TopicParamsDto', () => {
  it('accepts a positive integer id', async () => {
    await expect(parse(TopicParamsDto, { id: '12' }, 'param')).resolves.toEqual({ id: 12 });
  });

  it.each(['0', 'x', '4294967296', '1.0'])('rejects %p', async (id) => {
    await expect(parse(TopicParamsDto, { id }, 'param')).rejects.toMatchObject(bad);
  });
});

describe('TafsirsQueryDto', () => {
  it('requires ayah_id and parses book_ids', async () => {
    await expect(parse(TafsirsQueryDto, { ayah_id: '1' }, 'query')).resolves.toEqual({
      ayah_id: 1,
    });
    await expect(
      parse(TafsirsQueryDto, { ayah_id: '255', book_ids: '1,5,1' }, 'query'),
    ).resolves.toEqual({ ayah_id: 255, book_ids: [1, 5] });
  });

  it.each([
    {},
    { ayah_id: '' },
    { ayah_id: '0' },
    { ayah_id: 'abc' },
    { ayah_id: '1', book_ids: '' },
    { ayah_id: '1', book_ids: 'a,b' },
    { ayah_id: '1', book_ids: '1,,2' },
    { ayah_id: '1', book_ids: '256' },
    { ayah_id: '1', book_ids: Array.from({ length: 21 }, (_, i) => i).join(',') },
    { ayah_id: '1', extra: 'x' },
  ])('rejects %p', async (q) => {
    await expect(parse(TafsirsQueryDto, q, 'query')).rejects.toMatchObject(bad);
  });
});
