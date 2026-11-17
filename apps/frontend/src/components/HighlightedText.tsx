import type { Span } from '@/lib/api';
import { segments } from '@/lib/highlight';

/** Uthmani text with the engine's matched ranges highlighted (claude.md 5.8). */
export function HighlightedText({ text, highlights }: { text: string; highlights: Span[] }) {
  return (
    <>
      {segments(text, highlights).map((s, i) =>
        s.highlighted ? (
          <mark key={i} className="hl">
            {s.text}
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}
