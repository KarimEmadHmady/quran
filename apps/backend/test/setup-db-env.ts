// setupFiles for `npm run test:db`: load the developer's real apps/backend/.env
// with Node's built-in loader. Values are never printed.
import { resolve } from 'node:path';

process.loadEnvFile(resolve(__dirname, '..', '.env'));
