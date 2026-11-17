import type { PrismaService } from '../../prisma/prisma.service';
import { CORPUS_AYAH_SELECT, CORPUS_SURA_SELECT, CorpusLoader } from './corpus-loader.service';

/** Prisma stub that fails the test if anything other than `ayah` is touched. */
function guardedPrisma(findMany: jest.Mock) {
  const touched: string[] = [];
  const target = { ayah: { findMany } };
  const proxy = new Proxy(target, {
    get(t, prop: string) {
      touched.push(prop);
      if (prop !== 'ayah') throw new Error(`corpus loader must not access prisma.${prop}`);
      return t.ayah;
    },
  });
  return { prisma: proxy as unknown as PrismaService, touched };
}

describe('CorpusLoader', () => {
  it('selects exactly id, suraNumber, ayahNumber, textSimple, textUthmani from ayahs (never tafsirs.content)', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const { prisma, touched } = guardedPrisma(findMany);
    await new CorpusLoader(prisma).load();

    expect(touched).toEqual(['ayah']);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith({ select: CORPUS_AYAH_SELECT, orderBy: { id: 'asc' } });
    expect(Object.keys(CORPUS_AYAH_SELECT).sort()).toEqual(
      ['ayahNumber', 'id', 'suraNumber', 'textSimple', 'textUthmani'].sort(),
    );
    expect(JSON.stringify(findMany.mock.calls)).not.toMatch(/tafsir|content/);
  });

  it('loadSuras() reads only number, nameAr, ayahCount from suras', async () => {
    const rows = [{ number: 1, nameAr: 'الفاتحة', ayahCount: 7 }];
    const findMany = jest.fn().mockResolvedValue(rows);
    const touched: string[] = [];
    const prisma = new Proxy(
      { sura: { findMany } },
      {
        get(t, prop: string) {
          touched.push(prop);
          if (prop !== 'sura') throw new Error(`loadSuras must not access prisma.${prop}`);
          return t.sura;
        },
      },
    ) as unknown as PrismaService;
    await expect(new CorpusLoader(prisma).loadSuras()).resolves.toEqual(rows);
    expect(touched).toEqual(['sura']);
    expect(findMany).toHaveBeenCalledWith({
      select: CORPUS_SURA_SELECT,
      orderBy: { number: 'asc' },
    });
    expect(Object.keys(CORPUS_SURA_SELECT).sort()).toEqual(['ayahCount', 'nameAr', 'number']);
  });

  it('maps rows to corpus docs and turns a null text_simple into ""', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: 1, suraNumber: 1, ayahNumber: 1, textSimple: 'بسم الله', textUthmani: 'بِسْمِ ٱللَّهِ' },
      { id: 2, suraNumber: 1, ayahNumber: 2, textSimple: null, textUthmani: 'u' },
    ]);
    const docs = await new CorpusLoader(guardedPrisma(findMany).prisma).load();
    expect(docs).toEqual([
      { ayahId: 1, suraNumber: 1, ayahNumber: 1, textSimple: 'بسم الله', textUthmani: 'بِسْمِ ٱللَّهِ' },
      { ayahId: 2, suraNumber: 1, ayahNumber: 2, textSimple: '', textUthmani: 'u' },
    ]);
  });
});
