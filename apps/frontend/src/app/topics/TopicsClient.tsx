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

/** Design rows: folder icon (has sub-topics) or document icon, title, chevron. */
function Tree({ nodes, nested = false }: { nodes: TopicNode[]; nested?: boolean }) {
  return (
    <ul className={nested ? 'mt-1 space-y-1 border-s border-[var(--border)] ms-6 ps-3' : 'ui-card divide-y divide-[var(--border)] overflow-hidden'}>
      {nodes.map((t) => {
        const hasChildren = Boolean(t.children && t.children.length > 0);
        return (
          <li key={t.id} className={nested ? '' : 'py-1'}>
            <Link href={`/topics/${t.id}`} className="flex items-center gap-3 rounded-xl px-4 py-3 hover:bg-[var(--surface-2)]">
              <Icon name={hasChildren ? 'folder' : 'file'} className="h-5 w-5 shrink-0 text-[var(--muted)]" />
              <span className="flex-1 font-semibold">{t.title}</span>
              <Icon name="chevron" className="h-4 w-4 text-[var(--muted)]" />
            </Link>
            {hasChildren && <Tree nodes={t.children!} nested />}
          </li>
        );
      })}
    </ul>
  );
}

/** The topics tree with a live search box (filters the already-loaded tree: no extra requests). */
export function TopicsClient({ tree }: { tree: TopicNode[] }) {
  const [query, setQuery] = useState('');
  const inputId = useId();
  const q = fold(query);
  const shown = useMemo(() => (q ? filterTree(tree, q) : tree), [tree, q]);

  return (
    <>
      <div className="relative mb-4">
        <label htmlFor={inputId} className="sr-only">
          ابحث في المواضيع
        </label>
        <Icon name="search" className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--muted)]" />
        <input
          id={inputId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
          placeholder="ابحث باسم الموضوع…"
          autoComplete="off"
          className="ui-input w-full py-2.5 pe-10 ps-10"
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

      {shown.length === 0 ? (
        <div className="ui-card px-6 py-10 text-center" role="status">
          <p className="font-semibold">مفيش مواضيع مطابقة لـ «{query.trim()}»</p>
          <button type="button" onClick={() => setQuery('')} className="ui-chip mt-4">
            مسح البحث
          </button>
        </div>
      ) : (
        <Tree nodes={shown} />
      )}
    </>
  );
}
