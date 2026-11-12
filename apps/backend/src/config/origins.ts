/**
 * Parses a comma-separated list of browser origins (e.g. "https://quran.example,http://localhost:3000").
 * Each entry must be an exact origin: http(s) scheme + host [+ port], with no path, query or
 * trailing slash, because CORS compares origins as exact strings.
 * Returns undefined if any entry is invalid or the list is empty.
 */
export function parseOrigins(raw: string): string[] | undefined {
  const entries = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (entries.length === 0) return undefined;

  const origins: string[] = [];
  for (const entry of entries) {
    let url: URL;
    try {
      url = new URL(entry);
    } catch {
      return undefined;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    if (url.origin !== entry) return undefined; // rejects paths, trailing slashes, credentials
    if (!origins.includes(entry)) origins.push(entry);
  }
  return origins;
}
