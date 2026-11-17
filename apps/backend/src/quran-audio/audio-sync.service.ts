import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, type AudioReciter, type AudioSyncJob } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AlQuranCloudClient, UpstreamError } from './alquran-cloud.client';
import { AyahAudioService } from './ayah-audio.service';
import { listingKey, parseCdnListing, type CdnListing } from './cdn-listing';
import {
  ELIGIBLE,
  MAX_JOB_ERRORS,
  SYNC_BATCH,
  TOTAL_AYAHS,
  cdnUrl,
  isCdnUrlFor,
  parseCdnUrl,
} from './quran-audio.constants';
import { QuranNumberingService, type NumberedAyah } from './quran-numbering.service';
import { RecitersService, parseBitrates, type ReciterSyncResult } from './reciters.service';
import { isMissingAudioTable, migrationRequired } from './schema-guard';

export interface JobError {
  at: string;
  reciter: string | null;
  message: string;
}

export interface PublicJob {
  id: number;
  kind: 'reciters' | 'audio';
  status: 'running' | 'completed' | 'failed' | 'interrupted';
  recitersTotal: number;
  recitersDone: number;
  currentReciter: string | null;
  itemsTotal: number;
  itemsDone: number;
  missingCount: number;
  errorCount: number;
  pendingReciters: string[];
  errors: JobError[];
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
  /** True for an interrupted / failed audio job that still has reciters to process. */
  resumable: boolean;
  /** Reciter sync summary (kind = reciters, when finished). */
  summary?: ReciterSyncResult;
}

interface AudioRow {
  reciterId: number;
  ayahId: number;
  globalNumber: number;
  status: 'available' | 'missing';
  url: string | null;
  bitrate: number | null;
  source: 'cdn_listing' | 'api';
}

/** Verification source for one reciter: CDN file listing, or the API's own URLs. */
type Verifier =
  | { kind: 'listing'; bitrates: { bitrate: number; files: Set<number> }[] }
  | { kind: 'api'; urls: Map<number, string | null> };

/**
 * Background synchronization jobs (one at a time, progress persisted in audio_sync_jobs):
 *
 *  - reciters: AlQuran Cloud edition list -> audio_reciters (+ CDN pattern verification).
 *  - audio:    for every active, verified reciter and every ayah: the URL of a recording that
 *              is PROVEN to exist (CDN file listing), or — when the listing is unavailable —
 *              the URL AlQuran Cloud returns for that exact ayah (/quran/{edition}, one request
 *              per reciter, every ayah checked against our numbering). Ayahs without a
 *              recording are stored as 'missing'. Rows are upserted on (reciter_id, ayah_id), so
 *              re-running never duplicates anything; an interrupted job resumes at its cursor.
 *
 * Nothing outside the three audio tables is ever written.
 */
@Injectable()
export class AudioSyncService implements OnModuleInit {
  private readonly logger = new Logger('QuranAudioSync');
  private running: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: AlQuranCloudClient,
    private readonly numbering: QuranNumberingService,
    private readonly reciters: RecitersService,
    private readonly audio: AyahAudioService,
  ) {}

  /** A job still "running" in the DB after a restart was cut off: mark it interrupted. */
  async onModuleInit(): Promise<void> {
    try {
      const n = await this.prisma.audioSyncJob.updateMany({
        where: { status: 'running' },
        data: { status: 'interrupted' },
      });
      if (n.count > 0)
        this.logger.warn(
          `${n.count} sync job(s) were interrupted by a restart; they can be resumed`,
        );
    } catch (err) {
      if (isMissingAudioTable(err))
        this.logger.warn('audio tables missing: run `npm run db:migrate:audio`');
      else this.logger.warn('could not check for interrupted sync jobs');
    }
  }

  // ------------------------------------------------------------------ start

  async startReciterSync(adminId: number, force: boolean): Promise<PublicJob> {
    this.assertIdle();
    const job = await this.create({ kind: 'reciters', status: 'running' });
    this.logger.log(`admin=${adminId} started reciter sync job=${job.id} force=${force}`);
    this.launch(() => this.runReciters(job.id, force));
    return toPublic(job);
  }

  async startAudioSync(
    adminId: number,
    opts: { reciters?: string[]; resume?: boolean },
  ): Promise<PublicJob> {
    this.assertIdle();
    let job: AudioSyncJob;
    if (opts.resume) {
      const last = await this.guard(() =>
        this.prisma.audioSyncJob.findFirst({
          where: { kind: 'audio', status: { in: ['interrupted', 'failed'] } },
          orderBy: { id: 'desc' },
        }),
      );
      if (!last || parsePending(last.pendingReciters).length === 0)
        throw new ConflictException('There is no interrupted audio sync to resume');
      job = await this.prisma.audioSyncJob.update({
        where: { id: last.id },
        data: { status: 'running', finishedAt: null },
      });
      this.logger.log(`admin=${adminId} resumed audio sync job=${job.id}`);
    } else {
      const rows = await this.guard(() =>
        this.prisma.audioReciter.findMany({ orderBy: { id: 'asc' } }),
      );
      let targets = rows.filter((r) => r.isAvailable && r.isActive);
      if (opts.reciters?.length) {
        const wanted = new Set(opts.reciters);
        const unknown = opts.reciters.filter((id) => !rows.some((r) => r.identifier === id));
        if (unknown.length)
          throw new BadRequestException(`Unknown reciter(s): ${unknown.join(', ')}`);
        targets = rows.filter((r) => wanted.has(r.identifier));
      }
      const unverified = targets.filter((r) => !r.bitrate || !r.verifiedAt);
      targets = targets.filter((r) => r.bitrate && r.verifiedAt);
      if (targets.length === 0) {
        throw new ConflictException(
          'No verified reciters to synchronize: synchronize the reciters first',
        );
      }
      job = await this.create({
        kind: 'audio',
        status: 'running',
        recitersTotal: targets.length,
        itemsTotal: targets.length * TOTAL_AYAHS,
        pendingReciters: JSON.stringify(targets.map((r) => r.identifier)),
        errors: JSON.stringify(
          unverified.map((r): JobError => ({
            at: new Date().toISOString(),
            reciter: r.identifier,
            message: 'skipped: not verified (synchronize reciters first)',
          })),
        ),
        errorCount: unverified.length,
      });
      this.logger.log(
        `admin=${adminId} started audio sync job=${job.id} reciters=${targets.length}`,
      );
    }
    this.launch(() => this.runAudio(job.id));
    return toPublic(job);
  }

  // ------------------------------------------------------------------ status

  async status(): Promise<{
    running: PublicJob | null;
    lastReciterJob: PublicJob | null;
    lastAudioJob: PublicJob | null;
  }> {
    const [running, lastReciterJob, lastAudioJob] = await this.guard(() =>
      Promise.all([
        this.prisma.audioSyncJob.findFirst({
          where: { status: 'running' },
          orderBy: { id: 'desc' },
        }),
        this.prisma.audioSyncJob.findFirst({
          where: { kind: 'reciters' },
          orderBy: { id: 'desc' },
        }),
        this.prisma.audioSyncJob.findFirst({ where: { kind: 'audio' }, orderBy: { id: 'desc' } }),
      ]),
    );
    const pub = (j: AudioSyncJob | null) => (j ? toPublic(j) : null);
    return {
      running: pub(running),
      lastReciterJob: pub(lastReciterJob),
      lastAudioJob: pub(lastAudioJob),
    };
  }

  isRunning(): boolean {
    return this.running !== null;
  }

  // ------------------------------------------------------------------ runners

  private async runReciters(jobId: number, force: boolean): Promise<void> {
    try {
      const result = await this.reciters.sync(force, async (done, total, current) => {
        await this.prisma.audioSyncJob.update({
          where: { id: jobId },
          data: {
            recitersTotal: total,
            recitersDone: done,
            itemsTotal: total,
            itemsDone: done,
            currentReciter: current || null,
          },
        });
      });
      const errors = result.failed.map((f): JobError => ({
        at: new Date().toISOString(),
        reciter: f.identifier,
        message: f.error,
      }));
      await this.prisma.audioSyncJob.update({
        where: { id: jobId },
        data: {
          status: 'completed',
          finishedAt: new Date(),
          currentReciter: null,
          errorCount: errors.length,
          errors: JSON.stringify({ summary: result, errors: errors.slice(-MAX_JOB_ERRORS) }),
        },
      });
      this.audio.clearCache();
    } catch (err) {
      await this.fail(jobId, null, err);
    }
  }

  private async runAudio(jobId: number): Promise<void> {
    let listing: CdnListing | null | undefined; // undefined = not fetched yet
    try {
      const numbering = await this.numbering.get();
      for (;;) {
        const job = await this.prisma.audioSyncJob.findUniqueOrThrow({ where: { id: jobId } });
        const pending = parsePending(job.pendingReciters);
        if (pending.length === 0) break;
        const identifier = pending[0];
        await this.prisma.audioSyncJob.update({
          where: { id: jobId },
          data: { currentReciter: identifier },
        });

        const reciter = await this.prisma.audioReciter.findUnique({ where: { identifier } });
        if (!reciter || !reciter.bitrate || !reciter.verifiedAt) {
          await this.skipReciter(job, identifier, 'skipped: reciter missing or no longer verified');
          continue;
        }
        if (listing === undefined) listing = await this.loadListing(jobId);

        let verifier: Verifier;
        try {
          verifier = await this.verifierFor(reciter, listing, numbering.ayahs);
        } catch (err) {
          if (isTransient(err)) throw err; // job fails, reciter stays pending -> resumable
          await this.skipReciter(
            job,
            identifier,
            `skipped: ${err instanceof Error ? err.message : 'verification failed'}`,
          );
          continue;
        }

        const start =
          job.cursorAyahId === null
            ? 0
            : numbering.ayahs.findIndex((a) => a.ayahId === job.cursorAyahId) + 1;
        for (let i = start; i < numbering.ayahs.length; i += SYNC_BATCH) {
          const batch = numbering.ayahs.slice(i, i + SYNC_BATCH);
          const rows = batch.map((a) => rowFor(reciter, a, verifier));
          await this.upsert(rows);
          await this.prisma.audioSyncJob.update({
            where: { id: jobId },
            data: {
              itemsDone: { increment: rows.length },
              missingCount: { increment: rows.filter((r) => r.status === 'missing').length },
              cursorAyahId: batch[batch.length - 1].ayahId,
            },
          });
        }
        await this.prisma.audioReciter.update({
          where: { id: reciter.id },
          data: { lastSyncedAt: new Date() },
        });
        await this.prisma.audioSyncJob.update({
          where: { id: jobId },
          data: {
            recitersDone: { increment: 1 },
            pendingReciters: JSON.stringify(pending.slice(1)),
            cursorAyahId: null,
          },
        });
        this.audio.clearCache();
      }
      await this.prisma.audioSyncJob.update({
        where: { id: jobId },
        data: { status: 'completed', finishedAt: new Date(), currentReciter: null },
      });
      this.audio.clearCache();
    } catch (err) {
      const job = await this.prisma.audioSyncJob
        .findUnique({ where: { id: jobId } })
        .catch(() => null);
      await this.fail(jobId, job?.currentReciter ?? null, err);
    }
  }

  /** The CDN listing, once per run; null when it cannot be fetched or parsed. */
  private async loadListing(jobId: number): Promise<CdnListing | null> {
    try {
      const listing = parseCdnListing(await this.client.cdnListing());
      if (listing) return listing;
      await this.addError(
        jobId,
        null,
        'CDN listing has an unexpected format; verifying through the API instead',
      );
    } catch {
      await this.addError(
        jobId,
        null,
        'CDN listing unavailable; verifying through the API instead',
      );
    }
    return null;
  }

  private async verifierFor(
    reciter: AudioReciter,
    listing: CdnListing | null,
    ayahs: NumberedAyah[],
  ): Promise<Verifier> {
    if (listing) {
      const bitrates = [
        reciter.bitrate!,
        ...parseBitrates(reciter.secondaryBitrates).filter((b) => b !== reciter.bitrate),
      ]
        .map((bitrate) => ({
          bitrate,
          files: listing.get(listingKey(bitrate, reciter.identifier)),
        }))
        .filter((x): x is { bitrate: number; files: Set<number> } => !!x.files);
      // The primary bitrate must be listed; otherwise the listing does not cover this edition.
      if (bitrates.length > 0 && bitrates[0].bitrate === reciter.bitrate)
        return { kind: 'listing', bitrates };
    }
    const remote = await this.client.quran(reciter.identifier);
    if (remote.edition !== reciter.identifier || remote.format !== ELIGIBLE.format) {
      throw new Error(`API answered with another edition (${remote.edition || 'none'})`);
    }
    if (remote.ayahs.length !== ayahs.length)
      throw new Error(`API returned ${remote.ayahs.length} ayahs, expected ${ayahs.length}`);
    const urls = new Map<number, string | null>();
    ayahs.forEach((a, i) => {
      const r = remote.ayahs[i];
      const ok =
        r.number === a.globalNumber &&
        r.surahNumber === a.suraNumber &&
        r.numberInSurah === a.ayahNumber &&
        isCdnUrlFor(r.audio, reciter.identifier, a.globalNumber);
      urls.set(a.globalNumber, ok ? r.audio : null);
    });
    return { kind: 'api', urls };
  }

  private async upsert(rows: AudioRow[]): Promise<void> {
    if (rows.length === 0) return;
    const values = rows.map(
      (r) =>
        Prisma.sql`(${r.reciterId}, ${r.ayahId}, ${r.globalNumber}, ${r.status}, ${r.url}, ${r.bitrate}, ${r.source}, CURRENT_TIMESTAMP)`,
    );
    await this.prisma.$executeRaw`
      INSERT INTO ayah_audio (reciter_id, ayah_id, global_number, status, url, bitrate, source, checked_at)
      VALUES ${Prisma.join(values)}
      ON DUPLICATE KEY UPDATE
        global_number = VALUES(global_number), status = VALUES(status), url = VALUES(url),
        bitrate = VALUES(bitrate), source = VALUES(source), checked_at = VALUES(checked_at)`;
  }

  // ------------------------------------------------------------------ helpers

  private launch(run: () => Promise<void>): void {
    this.running = run().finally(() => {
      this.running = null;
    });
  }

  private assertIdle(): void {
    if (this.running) throw new ConflictException('A synchronization is already running');
  }

  private async create(data: Prisma.AudioSyncJobCreateInput): Promise<AudioSyncJob> {
    return this.guard(async () => {
      if (await this.prisma.audioSyncJob.findFirst({ where: { status: 'running' } })) {
        throw new ConflictException('A synchronization is already running');
      }
      return this.prisma.audioSyncJob.create({ data });
    });
  }

  private async skipReciter(job: AudioSyncJob, identifier: string, message: string): Promise<void> {
    await this.addError(job.id, identifier, message);
    await this.prisma.audioSyncJob.update({
      where: { id: job.id },
      data: {
        pendingReciters: JSON.stringify(
          parsePending(job.pendingReciters).filter((x) => x !== identifier),
        ),
        recitersDone: { increment: 1 },
        cursorAyahId: null,
      },
    });
  }

  private async addError(jobId: number, reciter: string | null, message: string): Promise<void> {
    const job = await this.prisma.audioSyncJob.findUnique({
      where: { id: jobId },
      select: { errors: true },
    });
    const errors = [
      ...parseErrors(job?.errors ?? null),
      { at: new Date().toISOString(), reciter, message: message.slice(0, 300) },
    ];
    await this.prisma.audioSyncJob.update({
      where: { id: jobId },
      data: { errors: JSON.stringify(errors.slice(-MAX_JOB_ERRORS)), errorCount: { increment: 1 } },
    });
  }

  private async fail(jobId: number, reciter: string | null, err: unknown): Promise<void> {
    const message =
      err instanceof UpstreamError
        ? `AlQuran Cloud unavailable (${err.message})`
        : 'synchronization failed';
    this.logger.error(`sync job=${jobId} failed: ${err instanceof Error ? err.message : 'error'}`);
    try {
      await this.addError(jobId, reciter, message);
      await this.prisma.audioSyncJob.update({
        where: { id: jobId },
        data: { status: 'failed', finishedAt: new Date() },
      });
    } catch {
      // DB unreachable: the row stays "running" and is marked interrupted on the next start.
    }
  }

  private async guard<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (isMissingAudioTable(err)) throw migrationRequired();
      throw err;
    }
  }
}

function rowFor(reciter: AudioReciter, a: NumberedAyah, v: Verifier): AudioRow {
  const common = { reciterId: reciter.id, ayahId: a.ayahId, globalNumber: a.globalNumber };
  if (v.kind === 'listing') {
    const hit = v.bitrates.find((b) => b.files.has(a.globalNumber));
    return hit
      ? {
          ...common,
          status: 'available',
          url: cdnUrl(hit.bitrate, reciter.identifier, a.globalNumber),
          bitrate: hit.bitrate,
          source: 'cdn_listing',
        }
      : { ...common, status: 'missing', url: null, bitrate: null, source: 'cdn_listing' };
  }
  const url = v.urls.get(a.globalNumber) ?? null;
  return url
    ? { ...common, status: 'available', url, bitrate: parseCdnUrl(url)!.bitrate, source: 'api' }
    : { ...common, status: 'missing', url: null, bitrate: null, source: 'api' };
}

/** Network / timeout / 429 / 5xx / malformed body: worth resuming later. A 4xx is permanent. */
const isTransient = (err: unknown) =>
  err instanceof UpstreamError &&
  (err.status === undefined || err.status === 408 || err.status === 429 || err.status >= 500);

export function parsePending(v: string | null): string[] {
  try {
    const p: unknown = JSON.parse(v ?? '[]');
    return Array.isArray(p) ? p.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function parseErrors(v: string | null): JobError[] {
  try {
    const p: unknown = JSON.parse(v ?? '[]');
    const list = Array.isArray(p)
      ? p
      : p && typeof p === 'object' && Array.isArray((p as { errors?: unknown }).errors)
        ? (p as { errors: unknown[] }).errors
        : [];
    return list.filter(
      (e): e is JobError =>
        !!e && typeof e === 'object' && typeof (e as JobError).message === 'string',
    );
  } catch {
    return [];
  }
}

function parseSummary(v: string | null): ReciterSyncResult | undefined {
  try {
    const p = JSON.parse(v ?? 'null') as { summary?: ReciterSyncResult } | null;
    return p && typeof p === 'object' && !Array.isArray(p) && p.summary ? p.summary : undefined;
  } catch {
    return undefined;
  }
}

function toPublic(j: AudioSyncJob): PublicJob {
  const pendingReciters = parsePending(j.pendingReciters);
  return {
    id: j.id,
    kind: j.kind,
    status: j.status,
    recitersTotal: j.recitersTotal,
    recitersDone: j.recitersDone,
    currentReciter: j.currentReciter,
    itemsTotal: j.itemsTotal,
    itemsDone: j.itemsDone,
    missingCount: j.missingCount,
    errorCount: j.errorCount,
    pendingReciters,
    errors: parseErrors(j.errors),
    startedAt: j.startedAt.toISOString(),
    updatedAt: j.updatedAt.toISOString(),
    finishedAt: j.finishedAt?.toISOString() ?? null,
    resumable:
      j.kind === 'audio' &&
      (j.status === 'interrupted' || j.status === 'failed') &&
      pendingReciters.length > 0,
    ...(j.kind === 'reciters' && { summary: parseSummary(j.errors) }),
  };
}
