/**
 * Imports apps/backend/adhkar.json into adhkar_categories / adhkar_items (prisma/sql/003_adhkar.sql)
 * in the database in DATABASE_URL (apps/backend/.env). Usage (from the repo root):
 *
 *   npm run db:migrate:adhkar     (once: creates the two tables)
 *   npm run db:import:adhkar      (safe to run any number of times)
 *
 * Optional env: ADHKAR_JSON (source file), ADHKAR_AUDIO_DIR (audio folder, default
 * apps/backend/audio-adhkar).
 *
 * Rules:
 *  - The source is validated FIRST. Any malformed entry (missing id / text / count, duplicate id,
 *    ...) aborts the whole import: nothing is skipped silently and nothing is written.
 *  - Text and titles are stored byte-for-byte as in the source (no trim, no normalisation).
 *  - Source ids, repetition counts, category relationships and order are kept.
 *  - Audio: only the file name is stored. A reference whose file is missing in the audio folder
 *    is stored as NULL and reported as a warning (the import still succeeds).
 *  - Idempotent: when the database already matches the source, nothing is written. Otherwise the
 *    two adhkar tables are replaced in ONE transaction (never partial, never duplicated).
 *    No other table is read or written.
 *  - After writing, everything is read back and compared exactly with the source.
 * Never prints the connection string or credentials.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql, { type Connection, type RowDataPacket } from 'mysql2/promise';

interface Category {
  id: number;
  title: string;
  sortOrder: number;
  audioFile: string | null;
}
interface Item {
  categoryId: number;
  itemNumber: number;
  sortOrder: number;
  text: string;
  repeatCount: number;
  audioFile: string | null;
}

const AUDIO_FILE = /^[A-Za-z0-9_-]{1,140}\.mp3$/;
const MAX_SMALLINT = 65_535;

const here = dirname(fileURLToPath(import.meta.url));
const backendDir = join(here, '..', 'apps', 'backend');
const sourcePath = resolve(process.env.ADHKAR_JSON ?? join(backendDir, 'adhkar.json'));
const audioDir = resolve(process.env.ADHKAR_AUDIO_DIR ?? join(backendDir, 'audio-adhkar'));

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isId = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= MAX_SMALLINT;

/** Throws with every problem found (all of them, not just the first). */
function parseSource(raw: unknown, warnings: string[]): { categories: Category[]; items: Item[] } {
  const errors: string[] = [];
  if (!Array.isArray(raw)) throw new Error('adhkar.json: the top level must be an array of categories');
  const categories: Category[] = [];
  const items: Item[] = [];
  const catIds = new Set<number>();

  const audio = (ref: unknown, where: string): string | null => {
    if (ref === undefined || ref === null || ref === '') {
      warnings.push(`${where}: no audio reference`);
      return null;
    }
    if (typeof ref !== 'string') {
      errors.push(`${where}: audio must be a string`);
      return null;
    }
    const file = basename(ref);
    if (!AUDIO_FILE.test(file)) {
      warnings.push(`${where}: unusable audio reference "${ref}" -> stored as none`);
      return null;
    }
    const full = join(audioDir, file);
    if (!existsSync(full) || !statSync(full).isFile()) {
      warnings.push(`${where}: audio file "${file}" not found in ${audioDir} -> stored as none`);
      return null;
    }
    return file;
  };

  raw.forEach((c: unknown, ci) => {
    const at = `category[${ci}]`;
    if (!isObj(c)) return void errors.push(`${at}: not an object`);
    if (!isId(c.id)) errors.push(`${at}: invalid id ${JSON.stringify(c.id)}`);
    else if (catIds.has(c.id)) errors.push(`${at}: duplicate category id ${c.id}`);
    else catIds.add(c.id);
    if (typeof c.category !== 'string' || c.category.trim() === '' || c.category.length > 255)
      errors.push(`${at}: invalid title`);
    if (!Array.isArray(c.array) || c.array.length === 0) return void errors.push(`${at}: "array" must be a non-empty array`);
    if (!isId(c.id) || typeof c.category !== 'string') return;
    const catId = c.id;
    categories.push({ id: catId, title: c.category, sortOrder: ci + 1, audioFile: audio(c.audio, `category ${catId}`) });

    const numbers = new Set<number>();
    c.array.forEach((it: unknown, ii) => {
      const iat = `category ${catId} item[${ii}]`;
      if (!isObj(it)) return void errors.push(`${iat}: not an object`);
      if (!isId(it.id)) return void errors.push(`${iat}: invalid id ${JSON.stringify(it.id)}`);
      if (numbers.has(it.id)) return void errors.push(`${iat}: duplicate item id ${it.id}`);
      numbers.add(it.id);
      if (typeof it.text !== 'string' || it.text.trim() === '') return void errors.push(`${iat}: empty text`);
      if (!isId(it.count)) return void errors.push(`${iat}: invalid count ${JSON.stringify(it.count)}`);
      items.push({
        categoryId: catId,
        itemNumber: it.id,
        sortOrder: ii + 1,
        text: it.text,
        repeatCount: it.count,
        audioFile: audio(it.audio, `category ${catId} item ${it.id}`),
      });
    });
  });

  if (errors.length > 0) throw new Error(`adhkar.json is invalid (nothing was imported):\n  - ${errors.join('\n  - ')}`);
  return { categories, items };
}

const catKey = (c: Category) => JSON.stringify([c.id, c.title, c.sortOrder, c.audioFile]);
const itemKey = (i: Item) =>
  JSON.stringify([i.categoryId, i.itemNumber, i.sortOrder, i.text, i.repeatCount, i.audioFile]);

async function readDb(conn: Connection): Promise<{ categories: Category[]; items: Item[] }> {
  const [cats] = await conn.query<RowDataPacket[]>(
    'SELECT id, title, sort_order, audio_file FROM adhkar_categories ORDER BY sort_order',
  );
  const [rows] = await conn.query<RowDataPacket[]>(
    'SELECT category_id, item_number, sort_order, text, repeat_count, audio_file FROM adhkar_items ORDER BY category_id, sort_order',
  );
  return {
    categories: cats.map((r) => ({ id: r.id, title: r.title, sortOrder: r.sort_order, audioFile: r.audio_file })),
    items: rows.map((r) => ({
      categoryId: r.category_id,
      itemNumber: r.item_number,
      sortOrder: r.sort_order,
      text: r.text,
      repeatCount: r.repeat_count,
      audioFile: r.audio_file,
    })),
  };
}

function sameContent(a: { categories: Category[]; items: Item[] }, b: { categories: Category[]; items: Item[] }): boolean {
  const sortItems = (xs: Item[]) => [...xs].sort((x, y) => x.categoryId - y.categoryId || x.sortOrder - y.sortOrder);
  const ca = [...a.categories].sort((x, y) => x.sortOrder - y.sortOrder).map(catKey);
  const cb = [...b.categories].sort((x, y) => x.sortOrder - y.sortOrder).map(catKey);
  const ia = sortItems(a.items).map(itemKey);
  const ib = sortItems(b.items).map(itemKey);
  return ca.length === cb.length && ia.length === ib.length && ca.every((k, i) => k === cb[i]) && ia.every((k, i) => k === ib[i]);
}

async function main(): Promise<number> {
  const uri = process.env.DATABASE_URL;
  if (!uri) {
    console.error('import-adhkar: DATABASE_URL is not set (expected in apps/backend/.env)');
    return 1;
  }
  if (!existsSync(sourcePath)) {
    console.error(`import-adhkar: source not found: ${sourcePath}`);
    return 1;
  }
  if (!existsSync(audioDir)) console.warn(`import-adhkar: audio folder not found (${audioDir}): every audio is stored as none`);

  const warnings: string[] = [];
  // Strip a UTF-8 BOM if present; the content itself is not touched.
  const source = parseSource(JSON.parse(readFileSync(sourcePath, 'utf8').replace(/^﻿/, '')), warnings);
  for (const w of warnings) console.warn(`import-adhkar: warning: ${w}`);

  const conn = await mysql.createConnection({ uri, charset: 'utf8mb4', multipleStatements: false });
  try {
    const [tables] = await conn.query<RowDataPacket[]>(
      "SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('adhkar_categories', 'adhkar_items')",
    );
    if (tables.length !== 2) {
      console.error('import-adhkar: the adhkar tables do not exist: run `npm run db:migrate:adhkar` first');
      return 1;
    }

    if (sameContent(await readDb(conn), source)) {
      console.log(
        `import-adhkar: already up to date (${source.categories.length} categories, ${source.items.length} items): nothing written`,
      );
      return 0;
    }

    await conn.beginTransaction();
    try {
      // Only the two adhkar tables (FK cascade removes the items with their categories).
      await conn.query('DELETE FROM adhkar_items');
      await conn.query('DELETE FROM adhkar_categories');
      await conn.query('INSERT INTO adhkar_categories (id, title, sort_order, audio_file) VALUES ?', [
        source.categories.map((c) => [c.id, c.title, c.sortOrder, c.audioFile]),
      ]);
      await conn.query(
        'INSERT INTO adhkar_items (category_id, item_number, sort_order, text, repeat_count, audio_file) VALUES ?',
        [source.items.map((i) => [i.categoryId, i.itemNumber, i.sortOrder, i.text, i.repeatCount, i.audioFile])],
      );
      const written = await readDb(conn);
      if (!sameContent(written, source)) throw new Error('read-back differs from the source: rolled back');
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    }

    const withAudio = source.items.filter((i) => i.audioFile).length;
    console.log(
      `import-adhkar: imported ${source.categories.length} categories and ${source.items.length} items ` +
        `(${withAudio} items with audio, ${source.categories.filter((c) => c.audioFile).length} categories with audio, ` +
        `${warnings.length} warning(s)); verified byte-for-byte against the source`,
    );
    return 0;
  } finally {
    await conn.end();
  }
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error('import-adhkar: failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  },
);
