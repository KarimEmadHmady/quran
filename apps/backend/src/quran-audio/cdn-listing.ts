/**
 * Parser for the CDN directory listing (https://cdn.islamic.network/quran/info/by-ayah/info.json).
 *
 * The listing is NOT a documented API: it is a `tree -J` style dump
 *   [ { type: "directory", name: ".../quran/audio", contents: [
 *       { type: "directory", name: "128", contents: [
 *         { type: "directory", name: "ar.alafasy", contents: [ { type: "file", name: "1.mp3" }, ... ] } ] } ] },
 *     { type: "report", ... } ]
 * It is parsed defensively: if the shape is not exactly this, `parseCdnListing` returns null and
 * the sync falls back to the documented API (/quran/{edition}) instead.
 */

/** key `${bitrate}/${edition}` -> global ayah numbers that have a file. */
export type CdnListing = Map<string, Set<number>>;

const FILE = /^(\d{1,4})\.mp3$/;
const BITRATE = /^\d{2,3}$/;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isDir = (v: unknown): v is { name: string; contents: unknown[] } =>
  isObj(v) && v.type === 'directory' && typeof v.name === 'string' && Array.isArray(v.contents);

export function listingKey(bitrate: number, edition: string): string {
  return `${bitrate}/${edition}`;
}

/**
 * `root` selects the tree: "audio" = per-ayah files (by-ayah/info.json), "audio-surah" = one
 * file per sura (by-surah/info.json, same shape; file names are sura numbers there).
 */
export function parseCdnListing(
  raw: unknown,
  root: 'audio' | 'audio-surah' = 'audio',
): CdnListing | null {
  if (!Array.isArray(raw)) return null;
  const nodes: unknown[] = raw;
  const rootPattern = root === 'audio' ? /\/quran\/audio\/?$/ : /\/quran\/audio-surah\/?$/;
  const tree = nodes.find((n) => isDir(n) && rootPattern.test(n.name));
  return parseTree(tree);
}

function parseTree(root: unknown): CdnListing | null {
  if (!isDir(root)) return null;
  const out: CdnListing = new Map();
  for (const br of root.contents) {
    if (!isDir(br) || !BITRATE.test(br.name)) continue;
    for (const ed of br.contents) {
      if (!isDir(ed)) continue;
      const files = new Set<number>();
      for (const f of ed.contents) {
        if (!isObj(f) || f.type !== 'file' || typeof f.name !== 'string') continue;
        const m = FILE.exec(f.name);
        if (m) files.add(Number(m[1]));
      }
      out.set(listingKey(Number(br.name), ed.name), files);
    }
  }
  return out.size > 0 ? out : null;
}
