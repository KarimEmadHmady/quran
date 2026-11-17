'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { TopicActions } from '@/components/admin/TopicActions';
import { TopicForm } from '@/components/admin/TopicForm';
import { Button, EmptyState, ErrorState, PageTitle, Pagination, Spinner, useToast } from '@/components/admin/ui';
import { useAdminData } from '@/components/admin/useAdminData';
import { Icon } from '@/components/Icon';
import { adminApi } from '@/lib/adminApi';

const STATUSES = [
  { value: 'all', label: 'الكل' },
  { value: 'visible', label: 'ظاهرة للمستخدمين' },
  { value: 'banned', label: 'محظورة' },
] as const;

export default function TopicsPage() {
  const toast = useToast();
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<(typeof STATUSES)[number]['value']>('all');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);

  // Debounced search; any filter change goes back to page 1.
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(input.trim().slice(0, 100));
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [input]);

  const { value, reload } = useAdminData((s) => adminApi.topics({ q, status, page, limit: 20 }, s), [q, status, page]);

  return (
    <>
      <PageTitle
        title="المواضيع"
        subtitle="إضافة وتعديل وحظر المواضيع وربط الآيات بها"
        actions={
          <Button onClick={() => setCreating(true)} data-testid="new-topic">
            <Icon name="plus" className="h-4 w-4" />
            موضوع جديد
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <label className="sr-only" htmlFor="topic-search">
          بحث في المواضيع
        </label>
        <input
          id="topic-search"
          type="search"
          className="ui-input px-3 py-2.5 sm:max-w-sm"
          placeholder="ابحث بالعنوان أو الرقم…"
          value={input}
          maxLength={100}
          onChange={(e) => setInput(e.target.value)}
        />
        <div role="radiogroup" aria-label="الحالة" className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={status === s.value}
              onClick={() => {
                setStatus(s.value);
                setPage(1);
              }}
              className={`ui-chip ${status === s.value ? '!border-[var(--accent)] !text-[var(--accent)]' : ''}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {value.state === 'loading' && <Spinner />}
      {value.state === 'error' && <ErrorState message={value.message} onRetry={reload} />}
      {value.state === 'ready' &&
        (value.data.data.length === 0 ? (
          <EmptyState title="لا توجد مواضيع" hint={q || status !== 'all' ? 'جرّب تغيير البحث أو الفلتر' : undefined} />
        ) : (
          <>
            <ul className="ui-card divide-y divide-[var(--border)] overflow-hidden" data-testid="topic-list">
              {value.data.data.map((t) => (
                <li key={t.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between" data-testid="topic-row">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="ui-num h-7 w-auto min-w-7 px-2 text-xs">{t.id}</span>
                      <Link href={`/admin/dashboard/topics/${t.id}`} className="font-semibold hover:text-[var(--accent)]">
                        {t.title}
                      </Link>
                      {t.isBanned && <span className="ui-badge bg-[var(--danger)] text-white">محظور</span>}
                      {!t.isBanned && t.hidden && <span className="ui-badge ui-badge-blue">مخفي (الأب محظور)</span>}
                    </div>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {t.ayahCount} آية · {t.childrenCount} موضوع فرعي
                      {t.parentId !== null && ` · تحت الموضوع ${t.parentId}`}
                    </p>
                  </div>
                  <TopicActions
                    topic={t}
                    onChanged={(msg) => {
                      toast('success', msg);
                      reload();
                    }}
                  />
                </li>
              ))}
            </ul>
            <Pagination {...value.data.pagination} onPage={setPage} />
          </>
        ))}

      {creating && (
        <TopicForm
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            toast('success', 'تمت إضافة الموضوع');
            reload();
          }}
        />
      )}
    </>
  );
}
