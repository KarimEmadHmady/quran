import { normalize } from '@quran/text-utils';

/**
 * Search tokens = words of the shared normalize() output (claude.md 5.2). The same function is
 * used for ayah text at index time and for queries, so both sides always agree.
 */
export function tokenize(text: string): string[] {
  const normalized = normalize(text);
  return normalized === '' ? [] : normalized.split(' ');
}
