import { tafsirParagraphs } from '@/lib/tafsirFormat';

/** Tafsir content as readable paragraphs (the text itself is never changed). */
export function TafsirText({ content, className = '' }: { content: string; className?: string }) {
  return (
    <div className={`space-y-3 ${className}`}>
      {tafsirParagraphs(content).map((p, i) => (
        <p key={i} className="whitespace-pre-line leading-8 [text-align:justify]">
          {p}
        </p>
      ))}
    </div>
  );
}
