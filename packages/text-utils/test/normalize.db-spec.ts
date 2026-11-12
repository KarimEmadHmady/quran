/**
 * Read-only checks of normalize() over the REAL corpus (opt-in: `npm run test:db`).
 * Only SELECTs; nothing is written. Needs DATABASE_URL from apps/backend/.env.
 */
import { createConnection, type Connection, type RowDataPacket } from 'mysql2/promise';
import { normalize } from '../src/normalize';

interface AyahRow extends RowDataPacket {
  id: number;
  text_simple: string | null;
  text_uthmani: string;
}

describe('normalize() over all ayahs (read-only)', () => {
  let conn: Connection;
  let rows: AyahRow[];

  beforeAll(async () => {
    const uri = process.env.DATABASE_URL;
    if (!uri) throw new Error('test:db needs DATABASE_URL from apps/backend/.env');
    conn = await createConnection({ uri, charset: 'utf8mb4' });
    [rows] = await conn.query<AyahRow[]>(
      'SELECT id, text_simple, text_uthmani FROM ayahs ORDER BY id',
    );
  });

  afterAll(async () => {
    await conn?.end(); // undefined if beforeAll failed
  });

  it('loads all 6236 ayahs with non-null text_simple', () => {
    expect(rows).toHaveLength(6236);
    expect(rows.filter((r) => r.text_simple === null)).toHaveLength(0);
  });

  it('is idempotent on every text_simple value: normalize(normalize(x)) === normalize(x)', () => {
    const failures = rows
      .map((r) => ({ id: r.id, once: normalize(r.text_simple ?? '') }))
      .filter(({ once }) => normalize(once) !== once)
      .map(({ id }) => id);
    expect(failures).toEqual([]);
  });

  it('is idempotent on every text_uthmani value as well', () => {
    const failures = rows
      .map((r) => ({ id: r.id, once: normalize(r.text_uthmani) }))
      .filter(({ once }) => normalize(once) !== once)
      .map(({ id }) => id);
    expect(failures).toEqual([]);
  });

  it('never produces an empty string for an ayah', () => {
    const empty = rows.filter((r) => normalize(r.text_simple ?? '') === '').map((r) => r.id);
    expect(empty).toEqual([]);
  });

  it('only emits Arabic letters, ASCII digits and single spaces', () => {
    const allowed = /^[ء-ي0-9]+( [ء-ي0-9]+)*$/;
    const bad = rows.filter((r) => !allowed.test(normalize(r.text_simple ?? ''))).map((r) => r.id);
    expect(bad).toEqual([]);
  });
});
