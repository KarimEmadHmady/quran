import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PdfRendererService } from '../src/export/pdf-renderer.service';
import { createTestApp } from './support/test-app';

const AYAHS = [
  {
    id: 262,
    suraNumber: 2,
    ayahNumber: 255,
    textUthmani: 'ٱللَّهُ لَآ إِلَٰهَ',
    textSimple: 'الله لا إله',
    juz: 3,
    page: 42,
    sura: { nameAr: 'البقرة' },
  },
  {
    id: 6222,
    suraNumber: 112,
    ayahNumber: 1,
    textUthmani: 'قُلْ هُوَ',
    textSimple: 'قل هو',
    juz: 30,
    page: 604,
    sura: { nameAr: 'الإخلاص' },
  },
];

function prismaStub() {
  return {
    ayah: {
      findMany: jest.fn(({ where }: { where: { id: { in: number[] } } }) =>
        Promise.resolve(AYAHS.filter((a) => where.id.in.includes(a.id))),
      ),
    },
    tafsirBook: {
      findMany: jest.fn(({ where }: { where: { id: { in: number[] } } }) =>
        Promise.resolve(where.id.in.includes(1) ? [{ id: 1, name: 'تفسير القرطبي' }] : []),
      ),
    },
    tafsir: { findMany: jest.fn().mockResolvedValue([{ ayahId: 262, bookId: 1, content: 'شرح' }]) },
  };
}

describe('POST /export/pdf + GET /ayahs (e2e, renderer stubbed)', () => {
  let app: NestExpressApplication;
  let render: jest.SpyInstance;

  beforeEach(async () => {
    app = await createTestApp([], prismaStub()); // fresh throttler per test
    render = jest
      .spyOn(app.get(PdfRendererService), 'render')
      .mockResolvedValue(Buffer.from('%PDF-1.7 test'));
  });

  afterEach(async () => {
    await app.close();
  });

  const post = (body: unknown) =>
    request(app.getHttpServer())
      .post('/export/pdf')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(body));

  it('returns the PDF as an attachment', async () => {
    const res = await post({ items: [{ ayahId: 262, tafsirBookId: 1 }, { ayahId: 6222 }] })
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toBe('attachment; filename="quran-selection.pdf"');
    expect(res.headers['cache-control']).toBe('no-store');
    expect((res.body as Buffer).toString()).toBe('%PDF-1.7 test');
    const [[html]] = render.mock.calls as [[string]];
    expect(html).toContain('سورة البقرة - آية ٢٥٥');
    expect(html).toContain('تفسير القرطبي');
    expect(html.indexOf('البقرة')).toBeLessThan(html.indexOf('الإخلاص')); // cart order
  });

  it.each<[string, unknown]>([
    ['no items', { items: [] }],
    ['missing items', {}],
    ['101 items', { items: Array.from({ length: 101 }, (_, i) => ({ ayahId: i + 1 })) }],
    ['non-integer ayahId', { items: [{ ayahId: 1.5 }] }],
    ['string ayahId', { items: [{ ayahId: '262' }] }],
    ['unknown item field', { items: [{ ayahId: 262, color: 'red' }] }],
    ['unknown top-level field', { items: [{ ayahId: 262 }], format: 'docx' }],
    ['hidden tafsir book', { items: [{ ayahId: 262, tafsirBookId: 2 }] }],
  ])('400 for %s', async (_name, body) => {
    await post(body).expect(400);
    expect(render).not.toHaveBeenCalled();
  });

  it('404 for an unknown ayah', async () => {
    const res = await post({ items: [{ ayahId: 999999 }] }).expect(404);
    expect(res.body).toMatchObject({ message: 'Ayah(s) not found: 999999' });
  });

  it('a form-encoded body is rejected (JSON only)', async () => {
    await request(app.getHttpServer())
      .post('/export/pdf')
      .type('form')
      .send('items=262')
      .expect(400);
  });

  it('uses the `export` throttler: the 11th export in a minute is 429', async () => {
    for (let i = 0; i < 10; i++) await post({ items: [{ ayahId: 262 }] }).expect(200);
    const res = await post({ items: [{ ayahId: 262 }] }).expect(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThanOrEqual(1);
  });

  it('GET /ayahs collapses duplicate ids (one row each, first position kept)', async () => {
    const res = await request(app.getHttpServer())
      .get('/ayahs')
      .query({ ids: '262,6222,262' })
      .expect(200);
    expect((res.body as { data: { id: number }[] }).data.map((a) => a.id)).toEqual([262, 6222]);
  });

  it('GET /ayahs?ids= returns the public ayah shape + sura name, in the order asked', async () => {
    const res = await request(app.getHttpServer())
      .get('/ayahs')
      .query({ ids: '6222,262,999999' })
      .expect(200);
    expect(res.body).toEqual({
      data: [
        {
          id: 6222,
          suraNumber: 112,
          ayahNumber: 1,
          textUthmani: 'قُلْ هُوَ',
          textSimple: 'قل هو',
          juz: 30,
          page: 604,
          suraName: 'الإخلاص',
        },
        {
          id: 262,
          suraNumber: 2,
          ayahNumber: 255,
          textUthmani: 'ٱللَّهُ لَآ إِلَٰهَ',
          textSimple: 'الله لا إله',
          juz: 3,
          page: 42,
          suraName: 'البقرة',
        },
      ],
    });
  });

  it.each([
    ['missing ids', {}],
    ['bad ids', { ids: '1,x' }],
    ['101 ids', { ids: Array.from({ length: 101 }, (_, i) => i + 1).join(',') }],
    ['zero', { ids: '0' }],
    ['a decimal', { ids: '1.5' }],
    ['a negative', { ids: '-1' }],
    ['exponent notation', { ids: '1e2' }],
    ['an empty item', { ids: '1,,2' }],
    ['a repeated parameter', { ids: ['1', '2'] }],
  ])('GET /ayahs 400 for %s', async (_n, query) => {
    await request(app.getHttpServer()).get('/ayahs').query(query).expect(400);
  });
});
