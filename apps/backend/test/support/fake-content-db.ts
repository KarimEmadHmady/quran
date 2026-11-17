/**
 * A tiny in-memory stand-in for the Prisma calls the admin content API (and the public topics /
 * search bootstrap) make, so the e2e tests exercise real create -> read -> delete flows without
 * a database. Only the query shapes used by the code are supported.
 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any, @typescript-eslint/require-await */

interface Cat {
  id: number;
  legacyUuid: string | null;
  parentId: number | null;
  title: string;
  titleRaw: string | null;
  description: string | null;
  isBanned: boolean;
}

export function createFakeContentDb() {
  const suras = [
    { number: 1, nameAr: 'الفاتحة', nameEn: 'Al-Fatiha', ayahCount: 2, revelationPlace: 'meccan' },
    {
      number: 112,
      nameAr: 'الإخلاص',
      nameEn: 'Al-Ikhlas',
      ayahCount: 2,
      revelationPlace: 'meccan',
    },
  ];
  const ayah = (id: number, suraNumber: number, ayahNumber: number, text: string) => ({
    id,
    suraNumber,
    ayahNumber,
    textUthmani: text,
    textSimple: text,
    juz: 1,
    page: 1,
  });
  const ayahs = [
    ayah(1, 1, 1, 'بسم الله الرحمن الرحيم'),
    ayah(2, 1, 2, 'الحمد لله رب العالمين'),
    ayah(3, 112, 1, 'قل هو الله أحد'),
    ayah(4, 112, 2, 'الله الصمد'),
  ];
  const cat = (id: number, parentId: number | null, title: string, isBanned = false): Cat => ({
    id,
    legacyUuid: `uuid-${id}`,
    parentId,
    title,
    titleRaw: `raw-${id}`,
    description: null,
    isBanned,
  });
  const categories: Cat[] = [
    cat(1, null, 'الدعاء'),
    cat(2, 1, 'أدعية الأنبياء'),
    cat(3, null, 'محظور', true),
    cat(4, 3, 'تحت المحظور'),
  ];
  let links = [
    { categoryId: 1, ayahId: 1 },
    { categoryId: 1, ayahId: 2 },
    { categoryId: 2, ayahId: 3 },
  ];
  const books = [
    { id: 0, name: 'placeholder', author: null as string | null },
    { id: 1, name: 'تفسير القرطبي', author: 'القرطبي' as string | null },
    { id: 2, name: 'غير متوفر لهذه الآية', author: null as string | null },
  ];
  const tafsirs = [
    { ayahId: 1, bookId: 1, content: 'tafsir 1/1' as string | null },
    { ayahId: 1, bookId: 2, content: 'tafsir 1/2 (hidden book)' as string | null },
    { ayahId: 2, bookId: 1, content: null as string | null },
  ];

  const project = (row: any, select?: any) => {
    if (!select) return { ...row };
    const out: any = {};
    for (const [k, v] of Object.entries(select)) {
      if (k === '_count') continue;
      if (v === true) out[k] = row[k];
    }
    return out;
  };
  const catOut = (c: Cat, select?: any) => {
    const out = project(c, select);
    if (select?._count) {
      out._count = {
        ayahLinks: links.filter((l) => l.categoryId === c.id).length,
        children: categories.filter((x) => x.parentId === c.id).length,
      };
    }
    return out;
  };
  /** Supports `n`, `{ in }`, `{ notIn }` and `{ in, notIn }`. */
  const inList = (cond: any, v: number): boolean => {
    if (cond === undefined) return true;
    if (typeof cond === 'number') return cond === v;
    return (!cond.in || cond.in.includes(v)) && (!cond.notIn || !cond.notIn.includes(v));
  };
  const ayahWhere = (where: any = {}): typeof ayahs =>
    ayahs.filter(
      (a) =>
        (where.OR === undefined || where.OR.some((w: any) => ayahWhere(w).includes(a))) &&
        inList(where.id, a.id) &&
        (where.suraNumber === undefined || a.suraNumber === where.suraNumber) &&
        (where.ayahNumber === undefined || a.ayahNumber === where.ayahNumber) &&
        (where.categoryLinks === undefined ||
          links.some(
            (l) => l.ayahId === a.id && l.categoryId === where.categoryLinks.some.categoryId,
          )),
    );
  const page = <T>(rows: T[], args: any) =>
    rows.slice(
      args?.skip ?? 0,
      args?.take === undefined ? undefined : (args.skip ?? 0) + args.take,
    );
  const withContent = (where: any = {}) =>
    tafsirs.filter(
      (t) =>
        (where.content === undefined || t.content !== null) &&
        (where.ayahId === undefined || t.ayahId === where.ayahId) &&
        inList(where.bookId, t.bookId),
    );

  const db = {
    sura: {
      count: jest.fn(async () => suras.length),
      findMany: jest.fn(async () => suras.map((s) => ({ ...s }))),
      findUnique: jest.fn(async ({ where }: any) => {
        const s = suras.find((x) => x.number === where.number);
        return s ? { ...s } : null;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const s = suras.find((x) => x.number === where.number)!;
        if (data.nameAr !== undefined) s.nameAr = data.nameAr;
        if (data.nameEn !== undefined) s.nameEn = data.nameEn;
        return { ...s };
      }),
    },
    ayah: {
      count: jest.fn(async (args: any = {}) => ayahWhere(args.where).length),
      findMany: jest.fn(async (args: any = {}) =>
        page(ayahWhere(args.where), args).map((a) => project(a, args.select)),
      ),
      findUnique: jest.fn(async ({ where, select }: any) => {
        const a = ayahs.find((x) => x.id === where.id);
        return a ? project(a, select) : null;
      }),
      findFirst: jest.fn(async ({ where, select }: any) => {
        const a = ayahWhere(where)[0];
        return a ? project(a, select) : null;
      }),
    },
    category: {
      findMany: jest.fn(async (args: any = {}) =>
        categories
          .filter((c) => args.where?.isBanned === undefined || c.isBanned === args.where.isBanned)
          .sort((a, b) => a.id - b.id)
          .map((c) => catOut(c, args.select)),
      ),
      findUnique: jest.fn(async ({ where, select }: any) => {
        const c = categories.find((x) => x.id === where.id);
        return c ? catOut(c, select) : null;
      }),
      create: jest.fn(async ({ data, select }: any) => {
        const c: Cat = {
          id: Math.max(0, ...categories.map((x) => x.id)) + 1,
          legacyUuid: null,
          titleRaw: null,
          ...data,
        };
        categories.push(c);
        return catOut(c, select);
      }),
      update: jest.fn(async ({ where, data, select }: any) => {
        const c = categories.find((x) => x.id === where.id)!;
        for (const [k, v] of Object.entries(data)) if (v !== undefined) (c as any)[k] = v;
        return catOut(c, select);
      }),
      delete: jest.fn(async ({ where }: any) => {
        const i = categories.findIndex((x) => x.id === where.id);
        const [c] = categories.splice(i, 1);
        links = links.filter((l) => l.categoryId !== where.id); // ON DELETE CASCADE
        return c;
      }),
    },
    categoryAyah: {
      count: jest.fn(async () => links.length),
      findMany: jest.fn(async ({ where }: any) =>
        links.filter((l) => l.categoryId === where.categoryId && inList(where.ayahId, l.ayahId)),
      ),
      createMany: jest.fn(async ({ data }: any) => {
        links.push(...data);
        return { count: data.length };
      }),
      deleteMany: jest.fn(async ({ where }: any) => {
        const before = links.length;
        links = links.filter(
          (l) => !(l.categoryId === where.categoryId && l.ayahId === where.ayahId),
        );
        return { count: before - links.length };
      }),
    },
    tafsirBook: {
      findMany: jest.fn(async (args: any = {}) =>
        books.filter((b) => inList(args.where?.id, b.id)).map((b) => ({ ...b })),
      ),
      findUnique: jest.fn(async ({ where }: any) => {
        const b = books.find((x) => x.id === where.id);
        return b ? { ...b } : null;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const b = books.find((x) => x.id === where.id)!;
        if (data.name !== undefined) b.name = data.name;
        if (data.author !== undefined) b.author = data.author;
        return { ...b };
      }),
    },
    tafsir: {
      count: jest.fn(async (args: any = {}) => withContent(args.where).length),
      groupBy: jest.fn(async ({ where }: any) => {
        const counts = new Map<number, number>();
        for (const t of withContent(where)) counts.set(t.bookId, (counts.get(t.bookId) ?? 0) + 1);
        return [...counts].map(([bookId, n]) => ({ bookId, _count: { _all: n } }));
      }),
      findMany: jest.fn(async ({ where }: any) =>
        withContent(where).map((t) => ({
          bookId: t.bookId,
          content: t.content,
          book: { ...books.find((b) => b.id === t.bookId)! },
        })),
      ),
    },
  };
  return { db, state: { suras, ayahs, categories, books, links: () => links } };
}
