'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AyahCard } from '@/components/AyahCard';
import { SearchBox } from '@/components/SearchBox';
import { VoiceSearchButton, type VoiceResult } from '@/components/VoiceSearchButton';
import { ApiRequestError, clampQuery, search, tafsirAvailability, type SearchResponse, type SearchResult } from '@/lib/api';
import { TafsirModal } from '@/components/TafsirModal';

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

  return (
    <div className="space-y-5">
      <div className="ui-input relative flex items-center gap-1 pe-1 focus-within:border-[var(--accent)]">
        <SearchBox
          value={input}
          onChange={setInput}
          onSubmit={(v) => {
            // An edited transcript is no longer what the recognizer heard: search it as text.
            go(v, { type: voice && v.trim() === voice.transcript ? 'voice' : 'text' });
          }}
        />
        <VoiceSearchButton onInterim={setInput} onResult={onVoice} />
      </div>
      <div className="h-3" aria-hidden />

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

      <p className="text-sm text-[var(--muted)]">
        {data.total === 0 ? 'مفيش نتايج.' : `${data.total} نتيجة`}
      </p>
      {low && !showAll && data.page === 1 && data.total > LOW_CONFIDENCE_TOP && (
        <p className="text-sm">
          مش متأكدين من التطابق — دي أقرب {LOW_CONFIDENCE_TOP} اقتراحات.{' '}
          <button type="button" className="text-[var(--accent)] underline" onClick={onShowAll}>
            عرض كل النتايج
          </button>
        </p>
      )}

      <div className="space-y-3">
        {shown.map((r) => (
          <AyahCard key={r.ayahId} result={r} onTafsir={withTafsir.has(r.ayahId) ? () => setTafsirOf(r) : undefined} />
        ))}
      </div>

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
        <nav aria-label="الصفحات" className="flex items-center justify-center gap-3 pt-2">
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
