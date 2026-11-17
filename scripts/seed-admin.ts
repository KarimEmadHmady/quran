/**
 * Creates the first admin account. Usage (from the repo root):
 *
 *   ADMIN_INITIAL_PASSWORD='a long passphrase' npm run seed:admin
 *
 * Creates admin@quran.com (name "Admin"); ADMIN_EMAIL / ADMIN_NAME override the defaults.
 *
 * (or put ADMIN_INITIAL_PASSWORD in apps/backend/.env for one run, then remove it).
 *
 * - Reads credentials from env only: never from argv, never prompts, never prints them.
 * - Password: at least 12 characters, at most 72 bytes (bcrypt limit). Hashed with bcrypt cost 12.
 * - INSERT only. If the email already exists, nothing is changed (no UPDATE / DELETE).
 */
import bcrypt from 'bcryptjs';
import mysql, { type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';
import {
  BCRYPT_COST,
  validateAdminSeedInput,
} from '../apps/backend/src/admin/auth/admin-credentials.ts';

async function main(): Promise<number> {
  const input = validateAdminSeedInput(process.env);
  if (!input.ok) {
    console.error(`seed-admin: invalid input\n${input.errors.map((e) => `  - ${e}`).join('\n')}`);
    return 1;
  }
  const uri = process.env.DATABASE_URL;
  if (!uri) {
    console.error('seed-admin: DATABASE_URL is not set (expected in apps/backend/.env)');
    return 1;
  }

  const conn = await mysql.createConnection({ uri, charset: 'utf8mb4' });
  try {
    const [existing] = await conn.execute<RowDataPacket[]>(
      'SELECT id FROM admins WHERE email = ?',
      [input.email],
    );
    if (existing.length > 0) {
      console.log(`seed-admin: an admin with this email already exists (id=${String(existing[0].id)}); nothing changed.`);
      return 0;
    }
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
    const [result] = await conn.execute<ResultSetHeader>(
      'INSERT INTO admins (email, password_hash, name) VALUES (?, ?, ?)',
      [input.email, passwordHash, input.name],
    );
    console.log(`seed-admin: created admin id=${result.insertId}.`);
    return 0;
  } finally {
    await conn.end();
  }
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    // Error messages from mysql2 do not contain the password; still print the message only.
    console.error(`seed-admin: failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    process.exit(1);
  },
);
