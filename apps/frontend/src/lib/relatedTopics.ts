/**
 * "Related topics" for a topic details page, computed from the public topic tree (GET
 * /topics?tree=true: banned topics and their subtrees are already excluded). Pure function: no
 * request, no data change.
 *
 * Score (higher = more related):
 *   parent topic +50 · sub-topic +40 · sibling (same parent) +30
 *   each shared title keyword +20 (Arabic-folded, «ال» stripped, common short words ignored)
 *   overall title similarity (character-bigram Dice) up to +25 when ≥ 0.35
 * Topics scoring < MIN_SCORE are dropped; the current topic is never suggested; no duplicates.
 */
import type { TopicNode } from './quran';

export type RelatedReason = 'parent' | 'child' | 'sibling' | 'similar';

export interface RelatedTopic {
  id: number;
  title: string;
  hasChildren: boolean;
  reason: RelatedReason;
  score: number;
}

const MIN_SCORE = 20;
const DEFAULT_LIMIT = 8;

/** Short / very common words that say nothing about the subject. */
const STOPWORDS = new Set(
  ['من', 'في', 'عن', 'علي', 'الي', 'ما', 'لا', 'مع', 'او', 'ثم', 'ان', 'اذا', 'هو', 'هي', 'ذلك', 'التي', 'الذي', 'به', 'لها', 'له', 'كل', 'بين'].map(
    (w) => fold(w),
  ),
);

/** Case-insensitive, diacritics / tatweel removed, أ إ آ ٱ → ا, ة → ه, ى → ي. */
function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[آأإٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Title keywords: folded, split on non-letters, «ال» / «و» prefixes stripped, ≥ 3 letters, no stopwords. */
function keywords(title: string): Set<string> {
  const out = new Set<string>();
  for (const raw of fold(title).split(/[^\p{L}\p{N}]+/u)) {
    if (!raw || STOPWORDS.has(raw)) continue;
    let w = raw;
    if (w.length > 4 && w.startsWith('وال')) w = w.slice(3);
    else if (w.length > 3 && w.startsWith('ال')) w = w.slice(2);
    if (w.length >= 3 && !STOPWORDS.has(w)) out.add(w);
  }
  return out;
}

function bigrams(s: string): Map<string, number> {
  const t = fold(s).replace(/\s+/g, '');
  const m = new Map<string, number>();
  for (let i = 0; i < t.length - 1; i++) {
    const b = t.slice(i, i + 2);
    m.set(b, (m.get(b) ?? 0) + 1);
  }
  return m;
}

/** Dice coefficient on character bigrams (0..1). */
function similarity(a: Map<string, number>, b: Map<string, number>): number {
  let total = 0;
  let shared = 0;
  for (const n of a.values()) total += n;
  for (const n of b.values()) total += n;
  if (total === 0) return 0;
  for (const [k, n] of a) shared += Math.min(n, b.get(k) ?? 0);
  return (2 * shared) / total;
}

interface Flat {
  id: number;
  parentId: number | null;
  title: string;
  hasChildren: boolean;
}

function flatten(nodes: TopicNode[], parentId: number | null, out: Map<number, Flat>): void {
  for (const n of nodes) {
    if (out.has(n.id)) continue; // no duplicates even if the data repeated a node
    const children = n.children ?? [];
    out.set(n.id, { id: n.id, parentId: n.parentId ?? parentId, title: n.title, hasChildren: children.length > 0 });
    flatten(children, n.id, out);
  }
}

export function relatedTopics(tree: TopicNode[], currentId: number, limit = DEFAULT_LIMIT): RelatedTopic[] {
  const all = new Map<number, Flat>();
  flatten(tree, null, all);
  const current = all.get(currentId);
  if (!current) return [];

  const curWords = keywords(current.title);
  const curGrams = bigrams(current.title);
  const results: RelatedTopic[] = [];

  for (const t of all.values()) {
    if (t.id === currentId) continue;
    let score = 0;
    let reason: RelatedReason = 'similar';
    if (t.id === current.parentId) {
      score += 50;
      reason = 'parent';
    } else if (t.parentId === currentId) {
      score += 40;
      reason = 'child';
    } else if (current.parentId !== null && t.parentId === current.parentId) {
      score += 30;
      reason = 'sibling';
    }
    const words = keywords(t.title);
    for (const w of words) if (curWords.has(w)) score += 20;
    const sim = similarity(curGrams, bigrams(t.title));
    if (sim >= 0.35) score += Math.round(sim * 25);
    if (score >= MIN_SCORE) results.push({ id: t.id, title: t.title, hasChildren: t.hasChildren, reason, score });
  }

  return results
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'ar'))
    .slice(0, limit);
}
