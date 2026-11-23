'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AyahCard } from '@/components/AyahCard';
import { SearchBox } from '@/components/SearchBox';
import { VoiceSearchButton, type VoiceResult } from '@/components/VoiceSearchButton';
import { ApiRequestError, clampQuery, search, tafsirAvailability, type SearchResponse, type SearchResult } from '@/lib/api';
import { TafsirModal } from '@/components/TafsirModal';
import { PageHeader } from '@/components/AppChrome';
import { Icon } from '@/components/Icon';

const PAGE_SIZE = 20;
/** claude.md 5.7: with a low-confidence top result, show the best 3 as suggestions. */
const LOW_CONFIDENCE_TOP = 3;

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; data: SearchResponse }
  | { kind: 'error'; message: string; retryable: boolean };

export function SearchClient() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const q = params.get('q') ?? '';
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);
  const type = params.get('type') === 'voice' ? 'voice' : 'text';

  const [input, setInput] = useState(q);
  const [voice, setVoice] = useState<VoiceResult | null>(null);
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [showAll, setShowAll] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => setInput(q), [q]);

  useEffect(() => {
    if (!q.trim()) {
      setState({ kind: 'idle' });
      return;
    }
    const ctrl = new AbortController();
    setState({ kind: 'loading' });
    setShowAll(false);
    // STT alternatives only belong to the transcript they came with.
    const alts = type === 'voice' && voice?.transcript === q ? voice.alternatives : [];
    search({ q, page, limit: PAGE_SIZE, type, alts }, ctrl.signal)
      .then((data) => setState({ kind: 'done', data }))
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        if (e instanceof ApiRequestError && e.status === 503) {
          setState({ kind: 'error', message: 'فهرس البحث لسه بيتجهز. جرّب بعد ثواني.', retryable: true });
        } else if (e instanceof ApiRequestError && e.status === 429) {
          setState({ kind: 'error', message: 'طلبات كتير في وقت قصير. استنى دقيقة وجرّب تاني.', retryable: true });
        } else if (e instanceof ApiRequestError && e.status === 400) {
          setState({ kind: 'error', message: 'نص البحث مش صالح (الحد 200 حرف و20 كلمة).', retryable: false });
        } else {
          setState({ kind: 'error', message: 'تعذّر الاتصال بالخادم.', retryable: true });
        }
      });
    return () => ctrl.abort();
    // `voice` is read only to attach alts to its own transcript.
  }, [q, page, type, retry]);

  const go = (text: string, opts: { type?: 'text' | 'voice'; page?: number } = {}) => {
    const clean = clampQuery(text);
    if (!clean) return;
    setInput(clean); // the search box shows the new query right away (suggestion / correction clicks)
    const sp = new URLSearchParams({ q: clean });
    if (opts.type === 'voice') sp.set('type', 'voice');
    if (opts.page && opts.page > 1) sp.set('page', String(opts.page));
    router.push(`${pathname}?${sp.toString()}`);
  };

  const onVoice = (r: VoiceResult) => {
    const transcript = clampQuery(r.transcript);
    setVoice({ transcript, alternatives: r.alternatives.map(clampQuery) });
    setInput(transcript);
    go(transcript, { type: 'voice' });
  };

  // An edited transcript is no longer what the recognizer heard: search it as text.
  const submit = (v: string) => go(v, { type: voice && v.trim() === voice.transcript ? 'voice' : 'text' });

  return (
    <div className="space-y-5">
      <PageHeader title="البحث">
        {/* Design: the search mode chip sits at the far (left) end of the title row. */}
        <span className="ms-auto inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-2)] px-3 py-1 text-xs text-[var(--muted)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" aria-hidden />
          {type === 'voice' ? 'بحث صوتي' : 'بحث نصي'}
        </span>
      </PageHeader>

      <div className="relative flex items-center gap-1 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-1.5 shadow-[0_2px_10px_rgb(0_0_0/0.04)] transition focus-within:border-[var(--accent)]">
        {/* RTL: first child = right side (mic), then the field, then clear + search on the left. */}
        <VoiceSearchButton onInterim={setInput} onResult={onVoice} />
        <SearchBox value={input} onChange={setInput} onSubmit={submit} />
        {input && (
          <button
            type="button"
            onClick={() => setInput('')}
            aria-label="مسح نص البحث"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--fg)]"
          >
            <Icon name="close" className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => submit(input)}
          aria-label="بحث"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--fg)] hover:bg-[var(--surface-2)]"
        >
          <Icon name="search" className="h-6 w-6" />
        </button>
      </div>
      <div className="h-1" aria-hidden />

      {type === 'voice' && voice && voice.transcript === q && (
        <section className="ui-card p-4 text-sm">
          <p>
            اللي اتسمع: <strong>«{voice.transcript}»</strong> — تقدر تعدّله في خانة البحث وتبحث تاني.
          </p>
          {voice.alternatives.length > 0 && (
            <p className="mt-2 flex flex-wrap items-center gap-2 text-[var(--muted)]">
              بدائل:
              {voice.alternatives.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => {
                    setInput(a);
                    go(a);
                  }}
                  className="ui-chip"
                >
                  {a}
                </button>
              ))}
            </p>
          )}
        </section>
      )}

      {state.kind === 'idle' && (
        <p className="text-[var(--muted)]">
          اكتب كلمة أو جزء من آية، أو مرجع زي <code>2:255</code> أو <code>البقرة 255</code>، أو دوس على
          الميكروفون واقرأ.
        </p>
      )}
      {state.kind === 'loading' && <p className="text-[var(--muted)]">جاري البحث…</p>}
      {state.kind === 'error' && (
        <p role="alert" className="text-[var(--danger)]">
          {state.message}{' '}
          {state.retryable && (
            <button type="button" className="underline" onClick={() => setRetry((n) => n + 1)}>
              إعادة المحاولة
            </button>
          )}
        </p>
      )}
      {state.kind === 'done' && (
        <Results data={state.data} showAll={showAll} onShowAll={() => setShowAll(true)} onSearch={go} />
      )}
    </div>
  );
}

function Results({
  data,
  showAll,
  onShowAll,
  onSearch,
}: {
  data: SearchResponse;
  showAll: boolean;
  onShowAll: () => void;
  onSearch: (q: string, opts?: { type?: 'text' | 'voice'; page?: number }) => void;
}) {
  const low = data.results[0]?.confidence === 'low';
  const shown = low && !showAll && data.page === 1 ? data.results.slice(0, LOW_CONFIDENCE_TOP) : data.results;
  const invalid = data.reference?.status === 'invalid' ? data.reference : null;
  const canShowAll = low && !showAll && data.page === 1 && data.total > LOW_CONFIDENCE_TOP;

  // One request per results page: which ayahs have a tafsir (the «تفسير» button shows only there).
  const [withTafsir, setWithTafsir] = useState<Set<number>>(new Set());
  const [tafsirOf, setTafsirOf] = useState<SearchResult | null>(null);
  const closeTafsir = useCallback(() => setTafsirOf(null), []);
  const idsKey = data.results.map((r) => r.ayahId).join(',');
  useEffect(() => {
    const ids = idsKey ? idsKey.split(',').map(Number) : [];
    setWithTafsir(new Set());
    if (ids.length === 0) return;
    const ctrl = new AbortController();
    tafsirAvailability(ids, ctrl.signal)
      .then((have) => setWithTafsir(new Set(have)))
      .catch(() => undefined); // no button rather than an empty one
    return () => ctrl.abort();
  }, [idsKey]);

  return (
    <div className="space-y-4">
      {data.corrected && (
        <p className="ui-hero p-4 text-sm">
          تم البحث عن{' '}
          {/* Clickable: puts the corrected phrase in the search box and searches it (same page). */}
          <button
            type="button"
            onClick={() => onSearch(data.corrected!.text)}
            title="ابحث بهذه العبارة"
            className="font-bold underline decoration-dotted underline-offset-4 hover:decoration-solid"
          >
            «{data.corrected.text}»
          </button>{' '}
          بدلاً من <strong>«{data.query.normalized}»</strong>
        </p>
      )}
      {data.didYouMean && (
        <p className="flex flex-wrap items-center gap-2">
          هل تقصد:
          {data.didYouMean.map((s) => (
            <button key={s} type="button" className="ui-chip text-[var(--accent)]" onClick={() => onSearch(s)}>
              {s}
            </button>
          ))}
        </p>
      )}
      {invalid && invalid.reason === 'ayah_out_of_range' && (
        <p className="text-[var(--danger)]">
          السورة رقم {invalid.sura} فيها {invalid.ayahCount} آية بس.
        </p>
      )}
      {invalid && invalid.reason === 'sura_out_of_range' && (
        <p className="text-[var(--danger)]">مفيش سورة رقم {invalid.sura} (السور من 1 لـ 114).</p>
      )}

      <div className="flex items-center justify-between gap-2 px-1 text-sm">
        <p className={data.total === 0 ? 'text-[var(--muted)]' : 'font-bold text-[var(--fg)]'}>
          {data.total === 0 ? 'مفيش نتايج.' : `${data.total} نتيجة`}
        </p>
        {data.totalPages > 1 && (
          <p className="text-xs text-[var(--muted)]">
            صفحة {data.page} من {data.totalPages}
          </p>
        )}
      </div>
      {canShowAll && (
        <p className="px-1 text-sm text-[var(--muted)]">
          مش متأكدين من التطابق — دي أقرب {LOW_CONFIDENCE_TOP} اقتراحات.
        </p>
      )}

      <div className="space-y-3">
        {shown.map((r, i) => (
          <AyahCard
            key={r.ayahId}
            result={r}
            position={(data.page - 1) * PAGE_SIZE + i + 1}
            onTafsir={withTafsir.has(r.ayahId) ? () => setTafsirOf(r) : undefined}
          />
        ))}
      </div>

      {(canShowAll || (data.totalPages > 1 && (showAll || !low))) && (
        <div className="flex items-center justify-center gap-3 pt-2 text-[var(--muted)]" aria-hidden>
          <span className="h-px w-16 bg-[var(--border)]" />
          <span className="text-xs">✦</span>
          <span className="h-px w-16 bg-[var(--border)]" />
        </div>
      )}
      {canShowAll && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onShowAll}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--fg)] hover:text-[var(--accent)]"
          >
            عرض كل النتايج
            <Icon name="chevron" className="h-4 w-4 -rotate-90" />
          </button>
        </div>
      )}

      {tafsirOf && (
        <TafsirModal
          ayahId={tafsirOf.ayahId}
          suraName={tafsirOf.suraName}
          ayahNumber={tafsirOf.ayahNumber}
          textUthmani={tafsirOf.textUthmani}
          onClose={closeTafsir}
        />
      )}

      {data.totalPages > 1 && (showAll || !low) && (
        <nav aria-label="الصفحات" className="flex items-center justify-center gap-3">
          <PageButton disabled={data.page <= 1} onClick={() => onSearch(data.query.raw, { page: data.page - 1 })}>
            السابق
          </PageButton>
          <span className="text-sm">
            صفحة {data.page} من {data.totalPages}
          </span>
          <PageButton
            disabled={data.page >= data.totalPages}
            onClick={() => onSearch(data.query.raw, { page: data.page + 1 })}
          >
            التالي
          </PageButton>
        </nav>
      )}
      {data.total === 0 && (
        <p className="text-sm text-[var(--muted)]">
          جرّب كلمات أقل، أو تأكد من الإملاء، أو <Link href="/search" className="underline">ابدأ بحث جديد</Link>.
        </p>
      )}
    </div>
  );
}

function PageButton(props: { disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      className="ui-chip disabled:opacity-40"
    >
      {props.children}
    </button>
  );
}
