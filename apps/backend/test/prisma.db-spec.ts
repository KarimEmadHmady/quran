/**
 * Read-only checks against the REAL database (opt-in: `npm run test:db`).
 * Only SELECTs; nothing is written. Not part of `npm test`.
 */
import { ConfigService } from '@nestjs/config';
import type { EnvVars } from '../src/config/env.validation';
import { PrismaService } from '../src/prisma/prisma.service';

// Expected Arabic is built from explicit code points so the values cannot be altered by an
// editor, formatter or terminal (RTL rendering, normalization).

// al-Fatiha
const AL_FATIHA = String.fromCodePoint(0x0627, 0x0644, 0x0641, 0x0627, 0x062a, 0x062d, 0x0629);

// category id=1 title (same code points as scripts/verify-db.ts)
// prettier-ignore
const CATEGORY_1_TITLE = String.fromCodePoint(
  0x0627, 0x0644, 0x062F, 0x0639, 0x0627, 0x0621, 0x0020, 0x0645, 0x0646, 0x0020,
  0x0627, 0x0644, 0x0642, 0x0631, 0x0623, 0x0646, 0x0020, 0x0648, 0x0020,
  0x0627, 0x0644, 0x0627, 0x0633, 0x062A, 0x062C, 0x0627, 0x0628, 0x0647,
);

// "bismi Allah" with kasra, sukun, alef wasla, shadda and fatha: parameter round-trip.
// prettier-ignore
const BISMILLAH = String.fromCodePoint(
  0x0628, 0x0650, 0x0633, 0x0652, 0x0645, 0x0650, 0x0020,
  0x0671, 0x0644, 0x0644, 0x0651, 0x064E, 0x0647, 0x0650,
);

describe('PrismaService against the real database (read-only)', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('test:db needs DATABASE_URL from apps/backend/.env');
    prisma = new PrismaService(new ConfigService<EnvVars, true>({ DATABASE_URL: url }));
    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  it('suras has exactly 114 rows', async () => {
    expect(await prisma.sura.count()).toBe(114);
  });

  it('uses utf8mb4 on the connection', async () => {
    const rows = await prisma.$queryRaw<{ cs: string }[]>`SELECT @@character_set_connection AS cs`;
    expect(rows[0].cs).toBe('utf8mb4');
  });

  it('reads Arabic exactly (sura 1 name_ar)', async () => {
    const sura = await prisma.sura.findUniqueOrThrow({
      where: { number: 1 },
      select: { nameAr: true },
    });
    expect(sura.nameAr).toBe(AL_FATIHA);
  });

  it('reads the repaired category id=1 title exactly', async () => {
    const cat = await prisma.category.findUniqueOrThrow({
      where: { id: 1 },
      select: { title: true },
    });
    expect(cat.title).toBe(CATEGORY_1_TITLE);
  });

  it('round-trips Arabic with diacritics through a bound parameter untouched', async () => {
    const rows = await prisma.$queryRaw<{ s: string }[]>`SELECT ${BISMILLAH} AS s`;
    expect(rows[0].s).toBe(BISMILLAH);
  });
});
