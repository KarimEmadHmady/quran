'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { search, type SearchResult } from '@/lib/api';

const ARABIC = /[ء-ي]/;
const DEBOUNCE_MS = 350;
const MIN_CHARS = 2;
const MAX_SUGGESTIONS = 8;

/** The Arabic text typed after any references already in the field ("2:255, الحمد" -> "الحمد"). */
export function arabicQueryOf(value: string): string {
  const i = value.search(ARABIC);
  return i === -1 ? '' : value.slice(i).trim();
}

/** Replaces the typed Arabic text with the chosen reference, keeping earlier references. */
export function withSelectedRef(value: string, ref: string, multiple: boolean): string {
  if (!multiple) return ref;
  const i = value.search(ARABIC);
  const before = (i === -1 ? value : value.slice(0, i)).replace(/[\s,،]+$/, '');
  return before ? `${before}, ${ref}` : ref;
}

/**
 * Text input with live verse suggestions: typing Arabic words of an ayah searches the existing
 * GET /search endpoint and lists matches (ayah text + sura name + reference). Picking one puts
 * its numeric reference ("2:255") in the field. Numeric references typed by hand work as before.
 */
export function AyahSuggestField({
  label,
  name,
  value,
  onChange,
  placeholder,
  hint,
  error,
  disabled,
  multiple = false,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
  /** The field holds a list of references: a pick is appended instead of replacing it. */
  multiple?: boolean;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const query = arabicQueryOf(value);

  useEffect(() => {
    if (query.length < MIN_CHARS) {
      setResults([]);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(() => {
      search({ q: query.slice(0, 200), limit: MAX_SUGGESTIONS }, ctrl.signal)
        .then((res) => {
          setResults(res.results.slice(0, MAX_SUGGESTIONS));
          setActive(-1);
        })
        .catch(() => !ctrl.signal.aborted && setResults([]))
        .finally(() => !ctrl.signal.aborted && setLoading(false));
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => !boxRef.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const pick = (r: SearchResult) => {
    onChange(withSelectedRef(value, `${r.suraNumber}:${r.ayahNumber}`, multiple));
    setOpen(false);
    setResults([]);
  };

  const showList = open && query.length >= MIN_CHARS;
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;

  return (
    <div className="space-y-1.5" ref={boxRef}>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          dir="auto"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (!showList || results.length === 0) return;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => (a + 1) % results.length);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => (a <= 0 ? results.length - 1 : a - 1));
            } else if (e.key === 'Enter' && active >= 0) {
              e.preventDefault();
              pick(results[active]);
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
          className={`ui-input px-3 py-2.5 ${error ? '!border-[var(--danger)]' : ''}`}
        />
        {showList && (
          <ul
            id={listId}
            role="listbox"
            aria-label="آيات مقترحة"
            className="absolute inset-x-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-1 shadow-xl"
          >
            {loading && results.length === 0 && <li className="px-3 py-3 text-sm text-[var(--muted)]">جارٍ البحث…</li>}
            {!loading && results.length === 0 && (
              <li className="px-3 py-3 text-sm text-[var(--muted)]">لا توجد آيات مطابقة</li>
            )}
            {results.map((r, i) => (
              <li
                key={r.ayahId}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(r)}
                onMouseEnter={() => setActive(i)}
                className={`cursor-pointer rounded-xl px-3 py-2 ${i === active ? 'bg-[var(--surface-2)]' : ''}`}
              >
                <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold">سورة {r.suraName}</span>
                  <span className="ui-badge ui-badge-blue" dir="ltr">
                    {r.suraNumber}:{r.ayahNumber}
                  </span>
                </div>
                <p className="quran-text line-clamp-2 !text-lg !leading-9">{r.textUthmani}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error ? (
        <p id={`${id}-err`} className="text-xs text-[var(--danger)]">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="text-xs text-[var(--muted)]">
            {hint}
          </p>
        )
      )}
    </div>
  );
}
