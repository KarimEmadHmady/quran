import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateGoldenSet, type GoldenCase } from './golden-set';

export const GOLDEN_FILE = join(__dirname, 'golden-queries.json');

/** Reads and validates golden-queries.json (throws on any malformed case). */
export function loadGoldenSet(path: string = GOLDEN_FILE): GoldenCase[] {
  return validateGoldenSet(JSON.parse(readFileSync(path, 'utf8')));
}
