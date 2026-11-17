/**
 * Applies the ADDITIVE Quran audio migrations (apps/backend/prisma/sql/NNN_*.sql, in name
 * order) to the database in DATABASE_URL (apps/backend/.env). Usage (from the repo root):
 *
 *   npm run db:migrate:audio
 *
 * Safety: the SQL files are split into statements and EVERY statement must be a
 * `CREATE TABLE IF NOT EXISTS` for one of the audio tables, otherwise nothing runs.
 * Existing tables and data are never altered. Running it twice is a no-op.
 * Never prints the connection string or credentials.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql, { type RowDataPacket } from 'mysql2/promise';

const ALLOWED_TABLES = new Set(['audio_reciters', 'ayah_audio', 'audio_sync_jobs', 'audio_surah_reciters']);
const MIGRATION_FILE = /^\d{3}_[a-z0-9_]+\.sql$/;
const CREATE = /^CREATE TABLE IF NOT EXISTS `([a-z_]+)`/;

function statements(sql: string): string[] {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function main(): Promise<number> {
  const uri = process.env.DATABASE_URL;
  if (!uri) {
    console.error('apply-audio-migration: DATABASE_URL is not set (expected in apps/backend/.env)');
    return 1;
  }
  const here = dirname(fileURLToPath(import.meta.url));
  const dir = join(here, '..', 'apps', 'backend', 'prisma', 'sql');
  const files = readdirSync(dir)
    .filter((f) => MIGRATION_FILE.test(f))
    .sort();
  const stmts = files.flatMap((f) => statements(readFileSync(join(dir, f), 'utf8')));

  for (const s of stmts) {
    const m = CREATE.exec(s);
    if (!m || !ALLOWED_TABLES.has(m[1])) {
      console.error('apply-audio-migration: refusing to run, unexpected statement:', s.slice(0, 80));
      return 1;
    }
  }

  const conn = await mysql.createConnection({ uri, charset: 'utf8mb4', multipleStatements: false });
  try {
    const [before] = await conn.query<RowDataPacket[]>('SHOW TABLES');
    const existing = new Set(before.map((r) => String(Object.values(r)[0])));
    for (const s of stmts) {
      const table = CREATE.exec(s)![1];
      await conn.query(s);
      console.log(`apply-audio-migration: ${table}: ${existing.has(table) ? 'already existed (unchanged)' : 'created'}`);
    }
    console.log('apply-audio-migration: done (no existing table was modified)');
    return 0;
  } finally {
    await conn.end();
  }
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error('apply-audio-migration: failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  },
);
