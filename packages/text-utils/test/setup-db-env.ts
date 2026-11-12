// setupFiles for `npm run test:db`: load DATABASE_URL from the backend's git-ignored .env.
// Parsed with Node's built-in parser and assigned into the test sandbox's process.env
// (process.loadEnvFile does not reach Jest's sandboxed env here). Values are never printed.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

const envPath = resolve(__dirname, '..', '..', '..', 'apps', 'backend', '.env');
const parsed = parseEnv(readFileSync(envPath, 'utf8')) as Record<string, string>;
process.env.DATABASE_URL ??= parsed.DATABASE_URL;
