'use client';

import Link from 'next/link';
import { useId, useMemo, useState } from 'react';
import { Icon } from '@/components/Icon';
import type { TopicNode } from '@/lib/quran';

/**
 * Loose Arabic matching for the topic filter: case-insensitive, diacritics / tatweel ignored,
 * أ إ آ ٱ → ا, ة → ه, ى → ي (so «الصلاة» finds «الصلاه» and the reverse).
 */
function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[آأإٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Keeps topics whose title matches, plus the parents leading to them. A matching topic keeps
 * its whole subtree (its sub-topics belong to it).
 */
function filterTree(nodes: TopicNode[], q: string): TopicNode[] {
  const out: TopicNode[] = [];
  for (const n of nodes) {
    if (fold(n.title).includes(q)) {
      out.push(n);
      continue;
    }
    const children = n.children ? filterTree(n.children, q) : [];
    if (children.length > 0) out.push({ ...n, children });
  }
  return out;
}

const countNodes = (nodes: TopicNode[]): number => nodes.reduce((n, t) => n + 1 + countNodes(t.children ?? []), 0);

/** Icon square colours, cycled per card (design). */
const TONES = [
  'bg-[var(--tile-gray)] text-[var(--accent)]',
  'bg-[var(--tile-sand)] text-[var(--gold)]',
  'bg-[var(--tile-mint)] text-[var(--accent)]',
];

/**
 * One design card per topic: icon square, title, a line of sub-topic names (or the description),
 * the sub-topic count, and a chevron. Sub-topics stay reachable: «المواضيع الفرعية» expands them
 * (open by default while searching).
 */
function TopicCard({ t, index, expanded }: { t: TopicNode; index: number; expanded: boolean }) {
  const [open, setOpen] = useState(false);
  const kids = t.children ?? [];
  const isOpen = open || expanded;
  const subtitle = t.description || kids.map((c) => c.title).join('، ');
  const panelId = useId();
  return (
    <li className="ui-elevated overflow-hidden">
      <Link href={`/topics/${t.id}`} className="flex items-center gap-3 p-4 transition hover:bg-[var(--surface-2)]">
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${TONES[index % TONES.length]}`}>
          <Icon name={kids.length > 0 ? 'folder' : 'file'} className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-lg font-bold">{t.title}</span>
          {subtitle && <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">{subtitle}</span>}
        </span>
        <Icon name="chevron" className="h-5 w-5 shrink-0 text-[var(--muted)]" />
      </Link>
      {kids.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setOpen(!isOpen)}
            aria-expanded={isOpen}
            aria-controls={panelId}
            disabled={expanded}
            className="flex w-full items-center gap-1.5 border-t border-[var(--border)] px-4 py-2.5 text-xs text-[var(--gold)] hover:bg-[var(--surface-2)] disabled:cursor-default"
          >
            <Icon name="grid" className="h-4 w-4" />
            {kids.length} موضوع فرعي
            {!expanded && (
              <Icon name="chevron" className={`ms-auto h-4 w-4 transition ${isOpen ? 'rotate-90' : '-rotate-90'}`} />
            )}
          </button>
          {isOpen && (
            <ul id={panelId} className="flex flex-wrap gap-2 px-4 pb-4">
              {kids.map((c) => (
                <li key={c.id}>
                  <Link href={`/topics/${c.id}`} className="ui-chip">
                    {c.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </li>
  );
}

/**
 * The topics list with a live search box and category chips (both filter the already-loaded
 * tree: no extra requests).
 */
export function TopicsClient({ tree }: { tree: TopicNode[] }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<number | null>(null);
  const inputId = useId();
  const q = fold(query);
  // Chips: «الكل» + every top-level topic that groups sub-topics.
  const categories = useMemo(() => tree.filter((t) => (t.children?.length ?? 0) > 0), [tree]);
  const total = useMemo(() => countNodes(tree), [tree]);
  const shown = useMemo(() => {
    const base = category === null ? tree : tree.filter((t) => t.id === category);
    return q ? filterTree(base, q) : base;
  }, [tree, q, category]);

  const chip = (id: number | null, label: string) => (
    <button
      key={id ?? 'all'}
      type="button"
      role="radio"
      aria-checked={category === id}
      onClick={() => setCategory(id)}
      className={`shrink-0 whitespace-nowrap rounded-full px-5 py-2 text-sm transition ${
        category === id ? 'bg-[var(--primary-bg)] font-semibold text-[var(--primary-fg)]' : 'bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--fg)]'
      }`}
    >
      {label}
    </button>
  );

  return (
    <>
      <div className="ui-elevated relative mb-4 rounded-2xl">
        <label htmlFor={inputId} className="sr-only">
          ابحث في المواضيع
        </label>
        <Icon name="search" className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--muted)]" />
        <input
          id={inputId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
          placeholder="ابحث باسم الموضوع…"
          autoComplete="off"
          className="w-full bg-transparent py-3.5 pe-11 ps-11 text-sm outline-none placeholder:text-[var(--muted)]"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="مسح البحث"
            className="absolute left-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]"
          >
            <Icon name="close" className="h-4 w-4" />
          </button>
        )}
      </div>

      {categories.length > 0 && (
        <div role="radiogroup" aria-label="الأقسام" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {chip(null, 'الكل')}
          {categories.map((c) => chip(c.id, c.title))}
        </div>
      )}

      <div className="mb-6 flex items-center gap-2 rounded-2xl bg-[var(--tile-gray)] px-4 py-3 text-sm">
        <span aria-hidden className="h-2 w-2 rounded-full bg-[var(--accent)]" />
        <span className="font-bold text-[var(--accent)]">{total}</span>
        <span className="text-[var(--muted)]">موضوعاً مفهرساً</span>
      </div>

      <h1 className="mb-3 text-lg font-bold text-[var(--accent)]">المواضيع الرئيسية</h1>

      {shown.length === 0 ? (
        <div className="ui-elevated px-6 py-10 text-center" role="status">
          <p className="font-semibold">مفيش مواضيع مطابقة لـ «{query.trim()}»</p>
          <button type="button" onClick={() => setQuery('')} className="ui-chip mt-4">
            مسح البحث
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {shown.map((t, i) => (
            <TopicCard key={t.id} t={t} index={i} expanded={Boolean(q)} />
          ))}
        </ul>
      )}
    </>
  );
}
