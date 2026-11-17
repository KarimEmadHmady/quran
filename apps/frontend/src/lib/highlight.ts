import type { Span } from './api';

export interface Segment {
  text: string;
  highlighted: boolean;
}

/**
 * Splits text_uthmani into plain / highlighted segments from the API's UTF-16 ranges
 * (claude.md 5.8: the backend already aligned them to the Uthmani text, so String.slice is
 * exact). Overlapping or out-of-range spans are clamped and merged.
 */
export function segments(text: string, spans: readonly Span[]): Segment[] {
  const clean = spans
    .map((s) => ({ start: Math.max(0, s.start), end: Math.min(text.length, s.end) }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start);
  const out: Segment[] = [];
  let pos = 0;
  for (const s of clean) {
    if (s.end <= pos) continue;
    const start = Math.max(s.start, pos);
    if (start > pos) out.push({ text: text.slice(pos, start), highlighted: false });
    out.push({ text: text.slice(start, s.end), highlighted: true });
    pos = s.end;
  }
  if (pos < text.length) out.push({ text: text.slice(pos), highlighted: false });
  return out;
}
