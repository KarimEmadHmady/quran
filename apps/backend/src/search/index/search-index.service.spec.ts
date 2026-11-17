import { Logger } from '@nestjs/common';
import type { CorpusLoader } from './corpus-loader.service';
import type { CorpusAyah } from './corpus-loader.service';
import type { SuraInfo } from '../query/sura-catalog';
import { SearchIndexService } from './search-index.service';

const DOCS: CorpusAyah[] = [
  {
    ayahId: 1,
    suraNumber: 112,
    ayahNumber: 1,
    textSimple: 'قل هو الله أحد',
    textUthmani: 'قُلْ هُوَ ٱللَّهُ أَحَدٌ',
  },
  {
    ayahId: 2,
    suraNumber: 112,
    ayahNumber: 2,
    textSimple: 'الله الصمد',
    textUthmani: 'ٱللَّهُ ٱلصَّمَدُ',
  },
];

/**
 * A loader whose load() calls can be resolved/rejected by the test. loadSuras() answers with
 * suras whose ayah counts match the docs last resolved (sura 112 = الإخلاص), unless
 * `suraRows` overrides it.
 */
function controllableLoader(suraRows?: SuraInfo[]) {
  const pending: { resolve: (d: CorpusAyah[]) => void; reject: (e: unknown) => void }[] = [];
  let last: CorpusAyah[] = [];
  const load = jest.fn(
    () =>
      new Promise<CorpusAyah[]>((resolve, reject) =>
        pending.push({
          resolve: (d) => {
            last = d;
            resolve(d);
          },
          reject,
        }),
      ),
  );
  const loadSuras = jest.fn(() => {
    if (suraRows) return Promise.resolve(suraRows);
    const counts = new Map<number, number>();
    for (const d of last) counts.set(d.suraNumber, (counts.get(d.suraNumber) ?? 0) + 1);
    return Promise.resolve(
      [...counts].map(([number, ayahCount]) => ({ number, nameAr: 'الإخلاص', ayahCount })),
    );
  });
  return { loader: { load, loadSuras } as unknown as CorpusLoader, load, loadSuras, pending };
}

describe('SearchIndexService', () => {
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;
  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('starts idle and not ready', () => {
    const svc = new SearchIndexService(controllableLoader().loader);
    expect(svc.isReady).toBe(false);
    expect(svc.current()).toBeNull();
    expect(svc.status()).toEqual({ state: 'idle', ready: false });
  });

  it('builds on bootstrap without blocking, then becomes ready', async () => {
    const { loader, pending } = controllableLoader();
    let t = 0;
    const svc = new SearchIndexService(loader, () => (t += 21));
    svc.onApplicationBootstrap(); // returns immediately
    expect(svc.status()).toEqual({ state: 'building', ready: false });

    pending[0].resolve(DOCS);
    const index = await svc.rebuild(); // joins the in-flight build
    expect(svc.current()).toBe(index);
    expect(svc.isReady).toBe(true);
    expect(svc.status()).toMatchObject({
      state: 'ready',
      ready: true,
      buildMs: 21,
      stats: { docs: 2, terms: 5, tokens: 6 },
    });
    expect(typeof svc.status().builtAt).toBe('string');
    expect(String((logSpy.mock.calls as unknown[][])[0][0])).toMatch(
      /Search index ready: 2 ayahs, 5 terms, 6 tokens/,
    );
  });

  it('shares one build between concurrent rebuild() calls', async () => {
    const { loader, load, pending } = controllableLoader();
    const svc = new SearchIndexService(loader);
    const a = svc.rebuild();
    const b = svc.rebuild();
    expect(a).toBe(b);
    expect(load).toHaveBeenCalledTimes(1);
    pending[0].resolve(DOCS);
    await a;
    const c = svc.rebuild(); // a new build after the previous one settled
    expect(c).not.toBe(a);
    expect(load).toHaveBeenCalledTimes(2);
    pending[1].resolve(DOCS);
    await c;
  });

  it('a failed first build: state failed, not ready, error logged without throwing on bootstrap', async () => {
    const { loader, pending } = controllableLoader();
    const svc = new SearchIndexService(loader);
    svc.onApplicationBootstrap();
    pending[0].reject(new Error('db down'));
    await expect(svc.rebuild()).rejects.toThrow('db down');
    expect(svc.status()).toEqual({ state: 'failed', ready: false });
    expect(String((errorSpy.mock.calls as unknown[][])[0][0])).toBe(
      'Search index build failed: db down',
    );
  });

  it('a failed rebuild keeps serving the previous index (atomic swap)', async () => {
    const { loader, pending } = controllableLoader();
    const svc = new SearchIndexService(loader);
    const first = svc.rebuild();
    pending[0].resolve(DOCS);
    const index = await first;

    const second = svc.rebuild();
    expect(svc.current()).toBe(index); // still served while rebuilding
    expect(svc.status()).toMatchObject({ state: 'building', ready: true });
    pending[1].reject('not an Error');
    await expect(second).rejects.toBe('not an Error');
    expect(svc.current()).toBe(index);
    expect(svc.status()).toMatchObject({ state: 'failed', ready: true });
    expect(String((errorSpy.mock.calls as unknown[][])[0][0])).toBe(
      'Search index build failed (keeping the previous index): unknown error',
    );
  });

  it('a successful rebuild swaps in the new index', async () => {
    const { loader, pending } = controllableLoader();
    const svc = new SearchIndexService(loader);
    const first = svc.rebuild();
    pending[0].resolve(DOCS);
    const old = await first;
    const second = svc.rebuild();
    pending[1].resolve(DOCS.slice(0, 1));
    const fresh = await second;
    expect(fresh).not.toBe(old);
    expect(svc.current()).toBe(fresh);
    expect(svc.current()?.docCount).toBe(1);
  });

  it('uses the real clock by default', async () => {
    const { loader, pending } = controllableLoader();
    const svc = new SearchIndexService(loader);
    const p = svc.rebuild();
    pending[0].resolve(DOCS);
    await p;
    expect(svc.status().buildMs).toBeGreaterThanOrEqual(0);
  });

  it('builds the highlight alignment with the index and swaps both together', async () => {
    const { loader, pending } = controllableLoader();
    const svc = new SearchIndexService(loader);
    expect(svc.currentAlignment()).toBeNull();
    const p = svc.rebuild();
    pending[0].resolve(DOCS);
    const index = await p;
    const alignment = svc.currentAlignment();
    expect(alignment?.size).toBe(index.docCount);
    expect(svc.status().alignment).toMatchObject({
      ayahs: 2,
      positional: 2,
      fallback: 0,
      invalid: 0,
    });
    // A highlight for "الله الصمد" (doc 1, words 0-1) is one continuous Uthmani range.
    const [range] = alignment!.rangesFor(1, [0, 1]);
    expect(DOCS[1].textUthmani.slice(range.start, range.end)).toBe(DOCS[1].textUthmani);
  });

  it('builds the sura catalog in the same snapshot as the index and alignment', async () => {
    const { loader, loadSuras, pending } = controllableLoader();
    const svc = new SearchIndexService(loader);
    expect(svc.currentSnapshot()).toBeNull();
    const p = svc.rebuild();
    pending[0].resolve(DOCS);
    const index = await p;
    expect(loadSuras).toHaveBeenCalledTimes(1);
    const snap = svc.currentSnapshot();
    expect(snap?.index).toBe(index);
    expect(snap?.alignment).toBe(svc.currentAlignment());
    expect(snap?.suras.get(112)).toEqual({ number: 112, nameAr: 'الإخلاص', ayahCount: 2 });
  });

  it('fails the build when suras.ayah_count disagrees with the indexed ayahs', async () => {
    const { loader, pending } = controllableLoader([
      { number: 112, nameAr: 'الإخلاص', ayahCount: 4 },
    ]);
    const svc = new SearchIndexService(loader);
    const p = svc.rebuild();
    pending[0].resolve(DOCS);
    await expect(p).rejects.toThrow(/ayah_count disagrees .* 112/);
    expect(svc.status()).toEqual({ state: 'failed', ready: false });
  });

  it('warns (without failing the build) when some ayahs cannot be aligned', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { loader, pending } = controllableLoader();
    const svc = new SearchIndexService(loader);
    const p = svc.rebuild();
    pending[0].resolve([{ ...DOCS[0], textUthmani: '' }, DOCS[1]]);
    await p;
    expect(svc.isReady).toBe(true);
    expect(svc.status().alignment).toMatchObject({ fallback: 1 });
    expect(String((warnSpy.mock.calls as unknown[][])[0][0])).toBe(
      'Highlight alignment degraded: 1 ayahs fell back to whole-ayah ranges, 0 invalid',
    );
  });
});
