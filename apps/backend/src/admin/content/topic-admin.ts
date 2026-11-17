import { normalize } from '@quran/text-utils';

/** The columns the admin topic helpers need (never legacyUuid / titleRaw). */
export interface TopicRow {
  id: number;
  parentId: number | null;
  title: string;
  isBanned: boolean;
}

/**
 * id -> publicly hidden? A topic is hidden when it is banned, when any ancestor is banned,
 * when its parent is missing, or when it sits in a parent cycle. This is the same rule
 * `visibleTopics()` applies to the public API, so the dashboard shows exactly what users see.
 */
export function hiddenMap(rows: readonly TopicRow[]): Map<number, boolean> {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const hidden = new Map<number, boolean>();

  for (const start of rows) {
    const chain: number[] = [];
    let node: TopicRow | undefined = start;
    let result = false;
    while (node) {
      const known = hidden.get(node.id);
      if (known !== undefined) {
        result = known;
        break;
      }
      if (chain.includes(node.id) || node.isBanned) {
        result = true; // cycle, or banned
        break;
      }
      chain.push(node.id);
      if (node.parentId === null) break;
      node = byId.get(node.parentId);
      if (!node) result = true; // missing parent
    }
    for (const id of chain) hidden.set(id, result);
    if (!hidden.has(start.id)) hidden.set(start.id, result);
  }
  return hidden;
}

/** All descendants of `id` (cycle-safe). */
export function descendantIds(rows: readonly TopicRow[], id: number): Set<number> {
  const children = new Map<number, number[]>();
  for (const r of rows) {
    if (r.parentId === null) continue;
    const list = children.get(r.parentId) ?? [];
    list.push(r.id);
    children.set(r.parentId, list);
  }
  const out = new Set<number>();
  const stack = [...(children.get(id) ?? [])];
  while (stack.length) {
    const next = stack.pop()!;
    if (out.has(next) || next === id) continue;
    out.add(next);
    stack.push(...(children.get(next) ?? []));
  }
  return out;
}

const ARABIC_RUN = /[؀-ۿݐ-ݿࢠ-ࣿ]+/g;

/**
 * Comparison key for duplicate titles. Arabic runs get the search normalization (hamza forms,
 * ta marbuta, alef maqsura, diacritics), so "الصلاة" and "الصلاه" collide; everything else is
 * kept (lower-cased), so Latin or numeric parts still tell titles apart.
 */
export function titleKey(title: string): string {
  return title
    .normalize('NFKC')
    .toLowerCase()
    .replace(ARABIC_RUN, (run) => normalize(run))
    .replace(/\s+/g, ' ')
    .trim();
}
