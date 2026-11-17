// setupFiles for `npm run test:write-db`: loads apps/backend/.env, then points DATABASE_URL at
// the isolated test database ("<db>_test", or TEST_DATABASE_NAME). Refuses to run otherwise,
// so write tests can never reach the real database. Values are never printed.
import { resolve } from 'node:path';

process.loadEnvFile(resolve(__dirname, '..', '.env'));

const raw = process.env.DATABASE_URL;
if (!raw) throw new Error('write-db tests: DATABASE_URL is not set');
const url = new URL(raw);
const source = decodeURIComponent(url.pathname.replace(/^\//, ''));
const target =
  process.env.TEST_DATABASE_NAME || (source.endsWith('_test') ? source : `${source}_test`);
if (!/^[A-Za-z0-9_]+_test$/.test(target)) {
  throw new Error('write-db tests: the target database must end with "_test"');
}
url.pathname = `/${target}`;
process.env.DATABASE_URL = url.toString();
process.env.WRITE_DB_TARGET = target;
