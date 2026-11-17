import { ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * True when the audio tables do not exist yet (migration not applied): Prisma P2021/P2022.
 * Public endpoints then fall back to live API data; admin writes answer 503.
 */
export function isMissingAudioTable(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    (err.code === 'P2021' || err.code === 'P2022')
  );
}

export const migrationRequired = () =>
  new ServiceUnavailableException('Audio tables are missing: run `npm run db:migrate:audio` first');
