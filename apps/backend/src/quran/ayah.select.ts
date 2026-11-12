import type { Prisma } from '@prisma/client';

/** The public shape of an ayah, everywhere it is returned. */
export const AYAH_PUBLIC_SELECT = {
  id: true,
  suraNumber: true,
  ayahNumber: true,
  textUthmani: true,
  textSimple: true,
  juz: true,
  page: true,
} as const satisfies Prisma.AyahSelect;

export type PublicAyah = Prisma.AyahGetPayload<{ select: typeof AYAH_PUBLIC_SELECT }>;
