/**
 * Display-only formatting of tafsir text: splits it into readable paragraphs WITHOUT changing,
 * removing or rewriting any of the content (every character is kept, in order).
 *
 * 1. Breaks already in the source win: blank lines separate paragraphs, single newlines stay
 *    as line breaks inside a paragraph (rendered with `white-space: pre-line`).
 * 2. A long block with no breaks at all is grouped into paragraphs at sentence ends
 *    (". ", "؟ ", "! ", ": " ...), a few sentences per paragraph.
 */
const SENTENCE_END = /(?<=[.!؟?:؛])\s+/;
const TARGET_PARAGRAPH = 450; // characters, roughly 4–6 lines on a phone

export function tafsirParagraphs(content: string): string[] {
  const text = content.replace(/\r\n?/g, '\n').trim();
  if (!text) return [];

  const blocks = text.split(/\n[ \t]*\n+/).map((b) => b.trim()).filter(Boolean);
  if (blocks.length > 1 || text.includes('\n')) return blocks;

  if (text.length <= TARGET_PARAGRAPH) return [text];
  const sentences = text.split(SENTENCE_END).filter(Boolean);
  const out: string[] = [];
  let current = '';
  for (const s of sentences) {
    if (current && current.length + s.length > TARGET_PARAGRAPH) {
      out.push(current);
      current = s;
    } else {
      current = current ? `${current} ${s}` : s;
    }
  }
  if (current) out.push(current);
  return out;
}
