/**
 * Creates (or recreates) an ISOLATED test database for tests that write data (Phase 6 admin
 * CRUD, dashboard browser tests). Usage (from the repo root):
 *
 *   npm run db:test:create
 *
 * - Source: the database in DATABASE_URL (apps/backend/.env). It is only READ
 *   (SHOW CREATE TABLE + INSERT ... SELECT executed by the server).
 * - Target: TEST_DATABASE_NAME, default "<source>_test". It must end with "_test" and differ
 *   from the source; it is dropped and rebuilt from scratch on every run.
 * - Same schema (foreign keys and cascades included) and the same content, so tests behave as
 *   on the real data. The admins table is created EMPTY (accounts are never copied).
 * - Prints the target name only; never the connection string or credentials.
 */
import mysql, { type RowDataPacket } from 'mysql2/promise';

/** Parents before children, so CREATE TABLE ... FOREIGN KEY always finds its target. */
const TABLES = ['admins', 'suras', 'ayahs', 'categories', 'category_ayah', 'tafsir_books', 'tafsirs'];
const NOT_COPIED = new Set(['admins']);
const SAFE_NAME = /^[A-Za-z0-9_]{1,64}$/;

async function main(): Promise<number> {
  const uri = process.env.DATABASE_URL;
  if (!uri) {
    console.error('create-test-db: DATABASE_URL is not set (expected in apps/backend/.env)');
    return 1;
  }
  const url = new URL(uri);
  const source = decodeURIComponent(url.pathname.replace(/^\//, ''));
  const target = process.env.TEST_DATABASE_NAME || `${source}_test`;
  if (!SAFE_NAME.test(source) || !SAFE_NAME.test(target)) {
    console.error('create-test-db: database names must match [A-Za-z0-9_]');
    return 1;
  }
  if (target === source || !target.endsWith('_test')) {
    console.error('create-test-db: the target must end with "_test" and differ from the source');
    return 1;
  }

  url.pathname = '/';
  const conn = await mysql.createConnection({ uri: url.toString(), charset: 'utf8mb4', multipleStatements: false });
  try {
    await conn.query(`DROP DATABASE IF EXISTS \`${target}\``);
    await conn.query(`CREATE DATABASE \`${target}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const table of TABLES) {
      const [rows] = await conn.query<RowDataPacket[]>(`SHOW CREATE TABLE \`${source}\`.\`${table}\``);
      const ddl = String(rows[0]['Create Table']);
      await conn.query(`USE \`${target}\``);
      await conn.query(ddl);
      if (!NOT_COPIED.has(table)) {
        await conn.query(`INSERT INTO \`${target}\`.\`${table}\` SELECT * FROM \`${source}\`.\`${table}\``);
      }
      const [count] = await conn.query<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM \`${target}\`.\`${table}\``);
      console.log(`create-test-db: ${target}.${table}: ${String(count[0].n)} rows`);
    }
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log(`create-test-db: ready -> ${target}`);
    return 0;
  } finally {
    await conn.end();
  }
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(`create-test-db: failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    process.exit(1);
  },
);
