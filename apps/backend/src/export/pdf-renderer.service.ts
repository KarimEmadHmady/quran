import { existsSync } from 'node:fs';
import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Browser } from 'puppeteer-core';
import type { EnvVars } from '../config/env.validation';

/** Renders at most this many PDFs at once; more wait their turn (Chrome is memory hungry). */
export const MAX_CONCURRENT_RENDERS = 2;
export const RENDER_TIMEOUT_MS = 30_000;

/** Where Chrome / Chromium / Edge usually live (puppeteer-core ships no browser). */
export const BROWSER_CANDIDATES: Record<string, string[]> = {
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ],
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ],
  linux: [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/snap/bin/chromium',
  ],
};

export function findBrowser(
  configured: string | undefined,
  platform: string = process.platform,
  exists: (p: string) => boolean = existsSync,
): string | null {
  if (configured) return exists(configured) ? configured : null;
  return (BROWSER_CANDIDATES[platform] ?? []).find(exists) ?? null;
}

/** Puppeteer's `launch`, injectable for tests. */
export type LaunchFn = (options: {
  executablePath: string;
  headless: boolean;
  args: string[];
}) => Promise<Browser>;

const UNAVAILABLE = 'PDF export is not available on this server right now';

/**
 * HTML -> PDF with puppeteer-core (spec 4.1). One browser, launched on first use and reused;
 * each render gets a fresh page that may load NOTHING from the network (the template inlines
 * the font), so injected content could never reach out.
 */
@Injectable()
export class PdfRendererService implements OnModuleDestroy {
  private readonly logger = new Logger(PdfRendererService.name);
  private browser: Promise<Browser> | null = null;
  private active = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(
    private readonly config: ConfigService<EnvVars, true>,
    private readonly launch: LaunchFn = async (o) =>
      (await import('puppeteer-core')).default.launch(o),
  ) {}

  async render(html: string): Promise<Buffer> {
    await this.acquire();
    try {
      const browser = await this.getBrowser();
      const page = await browser.newPage();
      try {
        page.setDefaultTimeout(RENDER_TIMEOUT_MS);
        await page.setRequestInterception(true);
        page.on('request', (req) => {
          const url = req.url();
          if (url.startsWith('data:') || url === 'about:blank') void req.continue();
          else void req.abort('blockedbyclient');
        });
        await page.setContent(html, { waitUntil: 'load', timeout: RENDER_TIMEOUT_MS });
        await page.evaluate('document.fonts.ready');
        const pdf = await page.pdf({
          format: 'A4',
          printBackground: true,
          preferCSSPageSize: true,
          displayHeaderFooter: true,
          headerTemplate: '<span></span>',
          footerTemplate:
            '<div style="width:100%;text-align:center;font-size:9px;color:#888">' +
            '<span class="pageNumber"></span> / <span class="totalPages"></span></div>',
          timeout: RENDER_TIMEOUT_MS,
        });
        return Buffer.from(pdf);
      } finally {
        await page.close().catch(() => undefined);
      }
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      this.logger.error(
        `PDF render failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
      throw new ServiceUnavailableException(UNAVAILABLE);
    } finally {
      this.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    const b = this.browser;
    this.browser = null;
    if (b) await (await b.catch(() => null))?.close().catch(() => undefined);
  }

  private getBrowser(): Promise<Browser> {
    if (!this.browser) {
      const path = findBrowser(this.config.get('PDF_BROWSER_PATH', { infer: true }));
      if (!path) {
        this.logger.error('No Chrome/Chromium/Edge found for PDF export (set PDF_BROWSER_PATH)');
        throw new ServiceUnavailableException(UNAVAILABLE);
      }
      const launching = this.launch({
        executablePath: path,
        headless: true,
        args: ['--disable-gpu', '--disable-dev-shm-usage', '--no-first-run'],
      }).then((b) => {
        b.on('disconnected', () => {
          if (this.browser === launching) this.browser = null; // relaunch on next render
        });
        return b;
      });
      launching.catch(() => {
        if (this.browser === launching) this.browser = null;
      });
      this.browser = launching;
    }
    return this.browser;
  }

  private acquire(): Promise<void> {
    if (this.active < MAX_CONCURRENT_RENDERS) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.waiting.push(resolve)); // slot handed over by release()
  }

  private release(): void {
    const next = this.waiting.shift();
    if (next) next();
    else this.active--;
  }
}
