import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { existsSync } from 'node:fs';
import type { Browser } from 'puppeteer-core';
import type { EnvVars } from '../config/env.validation';
import type { PrismaService } from '../prisma/prisma.service';
import { ExportService, FONT_PATH } from './export.service';
import {
  MAX_CONCURRENT_RENDERS,
  PdfRendererService,
  findBrowser,
  type LaunchFn,
} from './pdf-renderer.service';
import { arabicDigits, escapeHtml, renderExportHtml } from './pdf-template';

describe('pdf-template', () => {
  it('escapes HTML and renders Arabic-Indic numbers', () => {
    expect(escapeHtml(`<script>"&'`)).toBe('&lt;script&gt;&quot;&amp;&#39;');
    expect(arabicDigits(255)).toBe('٢٥٥');
  });

  it('renders RTL, the inline font, one block per ayah, and escaped tafsir', () => {
    const html = renderExportHtml(
      {
        dateLabel: '١٦ نوفمبر ٢٠٢٦',
        items: [
          { suraName: 'البقرة', suraNumber: 2, ayahNumber: 255, textUthmani: 'ٱللَّهُ <b>' },
          {
            suraName: 'الإخلاص',
            suraNumber: 112,
            ayahNumber: 1,
            textUthmani: 'قُلْ',
            tafsir: { bookName: 'القرطبي', content: 'شرح <img src=x onerror=alert(1)>' },
          },
          {
            suraName: 'الإخلاص',
            suraNumber: 112,
            ayahNumber: 2,
            textUthmani: 'ٱللَّهُ',
            tafsir: { bookName: 'القرطبي', content: null },
          },
        ],
      },
      'data:font/ttf;base64,AAAA',
    );
    expect(html).toContain('<html lang="ar" dir="rtl">');
    expect(html).toContain("src: url('data:font/ttf;base64,AAAA')");
    expect(html).toContain('سورة البقرة - آية ٢٥٥');
    expect(html).toContain('ٱللَّهُ &lt;b&gt;');
    expect(html).not.toContain('<img');
    expect(html).toContain('التفسير غير متوفر لهذه الآية.');
    expect(html.match(/<article>/g)).toHaveLength(3);
    expect(html).not.toMatch(/https?:\/\//); // nothing to fetch
  });

  it('the bundled font file exists (copied to dist by nest-cli assets)', () => {
    expect(existsSync(FONT_PATH)).toBe(true);
  });
});

describe('findBrowser', () => {
  it('uses PDF_BROWSER_PATH when set (and only if it exists)', () => {
    expect(findBrowser('/x/chrome', 'linux', (p) => p === '/x/chrome')).toBe('/x/chrome');
    expect(findBrowser('/x/chrome', 'linux', () => false)).toBeNull();
  });

  it('otherwise probes the usual install paths of the platform', () => {
    expect(findBrowser(undefined, 'linux', (p) => p === '/usr/bin/google-chrome')).toBe(
      '/usr/bin/google-chrome',
    );
    expect(findBrowser(undefined, 'plan9', () => true)).toBeNull();
  });
});

/** A fake browser/page recording what the renderer does. */
function fakeBrowser() {
  const handlers: ((req: unknown) => void)[] = [];
  let open = 0;
  let maxOpen = 0;
  const page = {
    setDefaultTimeout: jest.fn(),
    setRequestInterception: jest.fn().mockResolvedValue(undefined),
    on: jest.fn((_e: string, h: (req: unknown) => void) => handlers.push(h)),
    setContent: jest.fn(() => new Promise((r) => setTimeout(r, 5))),
    evaluate: jest.fn().mockResolvedValue(undefined),
    pdf: jest.fn().mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46])),
    close: jest.fn(() => {
      open--;
      return Promise.resolve();
    }),
  };
  const browser = {
    newPage: jest.fn(() => {
      open++;
      maxOpen = Math.max(maxOpen, open);
      return Promise.resolve(page);
    }),
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  };
  return { browser, page, handlers, maxOpen: () => maxOpen };
}

const config = (path?: string) => ({ get: () => path }) as unknown as ConfigService<EnvVars, true>;

describe('PdfRendererService', () => {
  const chrome = process.platform === 'win32' ? undefined : '/bin/sh'; // any existing file

  it('renders with a single reused browser and blocks every network request', async () => {
    const f = fakeBrowser();
    const launch = jest.fn<ReturnType<LaunchFn>, Parameters<LaunchFn>>(() =>
      Promise.resolve(f.browser as unknown as Browser),
    );
    const r = new PdfRendererService(config(chrome ?? process.execPath), launch);
    const pdf = await r.render('<p>x</p>');
    await r.render('<p>y</p>');
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(launch).toHaveBeenCalledTimes(1);
    expect(f.page.close).toHaveBeenCalledTimes(2);

    const req = (url: string) => ({ url: () => url, continue: jest.fn(), abort: jest.fn() });
    const external = req('https://example.com/x.js');
    const inline = req('data:font/ttf;base64,AA');
    f.handlers[0](external);
    f.handlers[0](inline);
    expect(external.abort).toHaveBeenCalled();
    expect(inline.continue).toHaveBeenCalled();
    await r.onModuleDestroy();
    expect(f.browser.close).toHaveBeenCalled();
  });

  it(`renders at most ${MAX_CONCURRENT_RENDERS} PDFs at once`, async () => {
    const f = fakeBrowser();
    const r = new PdfRendererService(config(process.execPath), () =>
      Promise.resolve(f.browser as unknown as Browser),
    );
    await Promise.all(Array.from({ length: 6 }, (_, i) => r.render(`<p>${i}</p>`)));
    expect(f.maxOpen()).toBe(MAX_CONCURRENT_RENDERS);
  });

  it('503 (no details) when no browser exists or rendering fails', async () => {
    const none = new PdfRendererService(config('/definitely/not/here'), jest.fn());
    await expect(none.render('x')).rejects.toBeInstanceOf(ServiceUnavailableException);

    const f = fakeBrowser();
    f.page.pdf.mockRejectedValueOnce(new Error('Target closed'));
    const failing = new PdfRendererService(config(process.execPath), () =>
      Promise.resolve(f.browser as unknown as Browser),
    );
    await expect(failing.render('x')).rejects.toThrow('PDF export is not available');
    expect(f.page.close).toHaveBeenCalled(); // page cleaned up
    await expect(failing.render('x')).resolves.toBeInstanceOf(Buffer); // slot released
  });
});

describe('ExportService', () => {
  const AYAHS = [
    {
      id: 262,
      suraNumber: 2,
      ayahNumber: 255,
      textUthmani: 'ءَايَةُ ٱلْكُرْسِيِّ',
      sura: { nameAr: 'البقرة' },
    },
    { id: 6222, suraNumber: 112, ayahNumber: 1, textUthmani: 'قُلْ هُوَ', sura: { nameAr: 'الإخلاص' } },
  ];
  function make() {
    const prisma = {
      tafsirBook: {
        findMany: jest.fn(({ where }: { where: { id: { in: number[] } } }) =>
          Promise.resolve(where.id.in.includes(1) ? [{ id: 1, name: 'تفسير القرطبي' }] : []),
        ),
      },
      ayah: {
        findMany: jest.fn(({ where }: { where: { id: { in: number[] } } }) =>
          Promise.resolve(AYAHS.filter((a) => where.id.in.includes(a.id))),
        ),
      },
      tafsir: {
        findMany: jest.fn().mockResolvedValue([{ ayahId: 262, bookId: 1, content: 'شرح' }]),
      },
    };
    const renderer = { render: jest.fn().mockResolvedValue(Buffer.from('%PDF')) };
    const svc = new ExportService(
      prisma as unknown as PrismaService,
      renderer as unknown as PdfRendererService,
      () => new Date('2026-11-16T00:00:00Z'),
    );
    return { svc, prisma, renderer };
  }

  it('keeps cart order, drops duplicates, and attaches the tafsir when asked', async () => {
    const { svc, prisma } = make();
    const doc = await svc.document([
      { ayahId: 6222 },
      { ayahId: 262, tafsirBookId: 1 },
      { ayahId: 6222 },
    ]);
    expect(doc.items).toEqual([
      { suraName: 'الإخلاص', suraNumber: 112, ayahNumber: 1, textUthmani: 'قُلْ هُوَ' },
      {
        suraName: 'البقرة',
        suraNumber: 2,
        ayahNumber: 255,
        textUthmani: 'ءَايَةُ ٱلْكُرْسِيِّ',
        tafsir: { bookName: 'تفسير القرطبي', content: 'شرح' },
      },
    ]);
    expect(doc.dateLabel).toContain('٢٠٢٦');
    // read-only: only findMany was used
    expect(Object.keys(prisma.ayah)).toEqual(['findMany']);
  });

  it('no tafsir query when nothing asks for one', async () => {
    const { svc, prisma } = make();
    await svc.document([{ ayahId: 262 }]);
    expect(prisma.tafsir.findMany).not.toHaveBeenCalled();
    expect(prisma.tafsirBook.findMany).not.toHaveBeenCalled();
  });

  it('refuses hidden (unconfirmed) or unknown tafsir books with 400', async () => {
    const { svc } = make();
    await expect(svc.document([{ ayahId: 262, tafsirBookId: 2 }])).rejects.toThrow(
      new BadRequestException('Tafsir book(s) not available: 2'),
    );
    await expect(svc.document([{ ayahId: 262, tafsirBookId: 9 }])).rejects.toThrow(
      'Tafsir book(s) not available: 9',
    );
  });

  it('404 for unknown ayahs', async () => {
    const { svc } = make();
    await expect(svc.document([{ ayahId: 262 }, { ayahId: 999999 }])).rejects.toThrow(
      new NotFoundException('Ayah(s) not found: 999999'),
    );
  });

  it('pdf() renders the HTML with the embedded font', async () => {
    const { svc, renderer } = make();
    await expect(svc.pdf([{ ayahId: 262 }])).resolves.toEqual(Buffer.from('%PDF'));
    const [[html]] = renderer.render.mock.calls as [[string]];
    expect(html).toContain('data:font/ttf;base64,');
    expect(html).toContain('سورة البقرة - آية ٢٥٥');
  });
});
