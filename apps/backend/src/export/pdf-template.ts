/**
 * HTML for the cart PDF (spec 4.1): RTL, a locally embedded Uthmani font (no external URL,
 * Puppeteer has no network), one block per ayah: "سورة X - آية Y", the Uthmani text, and the
 * tafsir when requested. Every value from the DB is HTML-escaped.
 */

export interface ExportAyah {
  suraName: string;
  suraNumber: number;
  ayahNumber: number;
  textUthmani: string;
  tafsir?: { bookName: string; content: string | null };
}

export interface ExportDocument {
  items: ExportAyah[];
  /** e.g. "16 نوفمبر 2026". */
  dateLabel: string;
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** Arabic-Indic digits for the headings (٢٥٥). */
export function arabicDigits(n: number): string {
  return String(n).replace(/[0-9]/g, (d) => String.fromCharCode(0x0660 + Number(d)));
}

export function renderExportHtml(doc: ExportDocument, fontDataUri: string): string {
  const blocks = doc.items
    .map((a) => {
      const tafsir = a.tafsir
        ? `<section class="tafsir"><h3>${escapeHtml(a.tafsir.bookName)}</h3><p>${
            a.tafsir.content === null
              ? '<em>التفسير غير متوفر لهذه الآية.</em>'
              : escapeHtml(a.tafsir.content)
          }</p></section>`
        : '';
      return `<article>
  <h2>سورة ${escapeHtml(a.suraName)} - آية ${arabicDigits(a.ayahNumber)}</h2>
  <p class="ayah">${escapeHtml(a.textUthmani)} <span class="num">﴿${arabicDigits(a.ayahNumber)}﴾</span></p>
  ${tafsir}
</article>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<title>آيات مختارة من القرآن الكريم</title>
<style>
  @font-face { font-family: 'Amiri Quran'; src: url('${fontDataUri}') format('truetype'); }
  @page { size: A4; margin: 18mm 16mm 20mm; }
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  html, body { background: #ffffff; }
  body { direction: rtl; font-family: 'Amiri Quran', serif; color: #1c1b19; margin: 0; }
  header { text-align: center; border-bottom: 1px solid #d9d3c4; padding-bottom: 8mm; margin-bottom: 8mm; }
  header h1 { font-size: 22pt; margin: 0 0 2mm; }
  header p { font-size: 11pt; color: #6b6760; margin: 0; }
  article { page-break-inside: avoid; break-inside: avoid; margin-bottom: 9mm; }
  h2 { font-size: 12pt; color: #0f6e56; margin: 0 0 2mm; font-weight: normal; }
  .ayah { font-size: 20pt; line-height: 2.1; margin: 0; text-align: right; overflow-wrap: anywhere; }
  .num { color: #0f6e56; }
  .tafsir { margin-top: 3mm; padding: 3mm 4mm; background: #f6f3ec; border-radius: 2mm; }
  .tafsir h3 { font-size: 11pt; margin: 0 0 1mm; color: #6b6760; font-weight: normal; }
  .tafsir p { font-size: 12.5pt; line-height: 1.9; margin: 0; white-space: pre-line; }
</style>
</head>
<body>
<header>
  <h1>آيات مختارة من القرآن الكريم</h1>
  <p>${escapeHtml(doc.dateLabel)} · عدد الآيات: ${arabicDigits(doc.items.length)}</p>
</header>
${blocks}
</body>
</html>`;
}
