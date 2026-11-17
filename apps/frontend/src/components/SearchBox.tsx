'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { MAX_QUERY_LENGTH, suggest, type SuggestResponse } from '@/lib/api';

/**
 * Search input with typing suggestions (claude.md 5.11: debounce 200ms, /search/suggest).
 * Keyboard: ↑/↓ to move, Enter to pick or submit, Esc to close.
 */
export function SearchBox({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
}) {
  const [items, setItems] = useState<SuggestResponse['suggestions']>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const skipNext = useRef(false);

  useEffect(() => {
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    const q = value.trim();
    if (!q) {
      setItems([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      suggest(q, ctrl.signal)
        .then((r) => {
          setItems(r.suggestions);
          setActive(-1);
        })
        .catch(() => setItems([])); // suggestions are best-effort
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [value]);

  const pick = (text: string) => {
    skipNext.current = true;
    onChange(text);
    setOpen(false);
    setItems([]);
  };

  return (
    <form
      role="search"
      className="relative flex-1"
      onSubmit={(e) => {
        e.preventDefault();
        setOpen(false);
        onSubmit(value);
      }}
    >
      <input
        type="search"
        value={value}
        maxLength={MAX_QUERY_LENGTH}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open || items.length === 0) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => (a + 1) % items.length);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => (a <= 0 ? items.length - 1 : a - 1));
          } else if (e.key === 'Enter' && active >= 0) {
            e.preventDefault();
            pick(items[active].text);
            onSubmit(items[active].text);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        placeholder="ابحث بكلمة أو جزء من آية أو مرجع (البقرة 255)…"
        aria-label="نص البحث"
        role="combobox"
        aria-expanded={open && items.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        className="w-full bg-transparent px-3 py-3 text-lg text-[var(--fg)] outline-none placeholder:text-[var(--muted)]"
      />
      {open && items.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute -inset-x-2 top-full z-20 mt-3 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-xl"
        >
          {items.map((s, i) => (
            <li
              key={s.text}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(s.text);
                onSubmit(s.text);
              }}
              className={`cursor-pointer px-4 py-3 ${i === active ? 'bg-[var(--surface-2)] text-[var(--accent)]' : ''}`}
            >
              {s.text}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
