/**
 * Read-only database verification (Step 1, kept as a reusable check).
 *
 *   npm run verify:db        (from the repo root; loads apps/backend/.env)
 *
 * Only SELECT statements. Reads DATABASE_URL from the environment and never prints it.
 * Exits with code 1 if any assertion fails, so the result does not depend on how a
 * terminal renders Arabic (some terminals show RTL letters reversed).
 */
import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2/promise';

// Built from explicit code points so the expected value cannot be altered by an editor,
// formatter or terminal (RTL rendering, normalization). Reads: الدعاء من القرأن و الاستجابه
// prettier-ignore
const EXPECTED_CATEGORY_1_TITLE = String.fromCodePoint(
  0x0627, 0x0644, 0x062F, 0x0639, 0x0627, 0x0621, 0x0020, 0x0645, 0x0646, 0x0020,
  0x0627, 0x0644, 0x0642, 0x0631, 0x0623, 0x0646, 0x0020, 0x0648, 0x0020,
  0x0627, 0x0644, 0x0627, 0x0633, 0x062A, 0x062C, 0x0627, 0x0628, 0x0647,
);

const EXPECTED_COUNTS: Record<string, number> = {
  admins: 0,
  ayahs: 6236,
  categories: 183,
  category_ayah: 6824,
  suras: 114,
  tafsir_books: 5,
  tafsirs: 18720,
};
const EXPECTED_BANNED_CATEGORIES = 3;

const failures: string[] = [];
function check(label: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures.push(label);
}

function toCodepoints(s: string): string {
  return [...s].map((c) => `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`).join(' ');
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set (expected in apps/backend/.env)');

  // Force utf8mb4 on the connection: the database default charset is utf8mb3.
  const conn = await mysql.createConnection({ uri: url, charset: 'utf8mb4' });
  try {
    const [[ver]] = await conn.query<RowDataPacket[]>(
      'SELECT VERSION() AS version, @@character_set_connection AS connCharset',
    );
    console.log(`MySQL ${String(ver.version)}, connection charset ${String(ver.connCharset)}`);
    check('MySQL major version is 8', String(ver.version).startsWith('8.'), String(ver.version));
    check('connection charset is utf8mb4', ver.connCharset === 'utf8mb4', String(ver.connCharset));

    for (const [table, expected] of Object.entries(EXPECTED_COUNTS)) {
      const [[row]] = await conn.query<RowDataPacket[]>('SELECT COUNT(*) AS n FROM ??', [table]);
      const n = Number(row.n);
      check(`${table} has ${expected} rows`, n === expected, `got ${n}`);
    }

    const [[banned]] = await conn.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS n FROM categories WHERE is_banned = ?',
      [1],
    );
    check(
      `categories with is_banned=1 = ${EXPECTED_BANNED_CATEGORIES}`,
      Number(banned.n) === EXPECTED_BANNED_CATEGORIES,
      `got ${Number(banned.n)}`,
    );

    const [cats] = await conn.query<RowDataPacket[]>('SELECT title FROM categories WHERE id = ?', [1]);
    const title = cats.length === 1 ? String(cats[0].title) : '';
    const titleOk = title === EXPECTED_CATEGORY_1_TITLE;
    check(
      'categories.title for id=1 equals the expected Arabic string (exact code points)',
      titleOk,
      titleOk ? `${[...title].length} code points` : `got ${toCodepoints(title)}`,
    );

    const [unexpectedCharsets] = await conn.query<RowDataPacket[]>(
      `SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND CHARACTER_SET_NAME IS NOT NULL AND CHARACTER_SET_NAME <> ?`,
      ['utf8mb4'],
    );
    check('every text column is utf8mb4', unexpectedCharsets.length === 0, `${unexpectedCharsets.length} non-utf8mb4`);
  } finally {
    await conn.end();
  }
}

main()
  .then(() => {
    if (failures.length) {
      console.error(`\n${failures.length} check(s) failed.`);
      process.exit(1);
    }
    console.log('\nAll database checks passed.');
  })
  .catch((err: unknown) => {
    console.error('verify-db error:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
