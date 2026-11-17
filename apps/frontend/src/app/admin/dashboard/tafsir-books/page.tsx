'use client';

import { useState } from 'react';
import { Alert, Button, EmptyState, ErrorState, Field, Modal, PageTitle, Spinner, useToast } from '@/components/admin/ui';
import { statusOf, useAdminData } from '@/components/admin/useAdminData';
import { Icon } from '@/components/Icon';
import { adminErrorMessage, LIMITS, validateBook } from '@/lib/admin';
import { adminApi, type AdminTafsirBook } from '@/lib/adminApi';

/**
 * Book name / author only. Which books users see is decided in the backend code
 * (HIDDEN_TAFSIR_BOOK_IDS) until a source is confirmed; there is no toggle here on purpose.
 */
export default function TafsirBooksPage() {
  const toast = useToast();
  const { value, reload } = useAdminData((s) => adminApi.tafsirBooks(s), []);
  const [editing, setEditing] = useState<AdminTafsirBook | null>(null);

  return (
    <>
      <PageTitle title="كتب التفسير" subtitle="تعديل اسم الكتاب ومؤلفه. نصوص التفسير ثابتة." />
      <div className="mb-4">
        <Alert kind="info">
          الكتب «المخفية» لا تظهر للمستخدمين حتى يتأكد مصدرها. الإظهار يتم من إعدادات الخادم وليس من هنا.
        </Alert>
      </div>
      {value.state === 'loading' && <Spinner />}
      {value.state === 'error' && <ErrorState message={value.message} onRetry={reload} />}
      {value.state === 'ready' &&
        (value.data.data.length === 0 ? (
          <EmptyState title="لا توجد كتب تفسير" />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2" data-testid="book-list">
            {value.data.data.map((b) => (
              <li key={b.id} className="ui-card flex flex-col gap-3 p-4" data-testid="book-row">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{b.name}</p>
                    <p className="text-sm text-[var(--muted)]">{b.author ?? 'المؤلف غير محدد'}</p>
                  </div>
                  {b.hidden ? (
                    <span className="ui-badge ui-badge-blue shrink-0">مخفي</span>
                  ) : (
                    <span className="ui-badge ui-badge-green shrink-0">ظاهر</span>
                  )}
                </div>
                <div className="flex items-center justify-between text-xs text-[var(--muted)]">
                  <span>
                    رقم {b.id} · {b.tafsirCount.toLocaleString('ar-EG')} نص
                  </span>
                  <button type="button" className="ui-chip" onClick={() => setEditing(b)} aria-label={`تعديل ${b.name}`}>
                    <Icon name="edit" className="h-4 w-4" />
                    تعديل
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ))}
      {editing && (
        <BookForm
          book={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            toast('success', 'تم حفظ بيانات الكتاب');
            reload();
          }}
        />
      )}
    </>
  );
}

function BookForm({ book, onClose, onSaved }: { book: AdminTafsirBook; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(book.name);
  const [author, setAuthor] = useState(book.author ?? '');
  const [errors, setErrors] = useState<{ name?: string; author?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const v = validateBook({ name, author });
    setErrors(v);
    if (v.name || v.author) return;
    setBusy(true);
    try {
      await adminApi.updateTafsirBook(book.id, { name: name.trim(), author: author.trim() || null });
      onSaved();
    } catch (err) {
      setFormError(adminErrorMessage(statusOf(err), 'save'));
      setBusy(false);
    }
  };

  return (
    <Modal title="تعديل كتاب التفسير" onClose={onClose} busy={busy}>
      <form onSubmit={submit} noValidate className="space-y-4" aria-label="تعديل كتاب التفسير">
        {formError && <Alert kind="error">{formError}</Alert>}
        <Field label="اسم الكتاب" name="name" value={name} maxLength={LIMITS.bookName} onChange={(e) => setName(e.target.value)} error={errors.name} disabled={busy} />
        <Field
          label="المؤلف (اختياري)"
          name="author"
          value={author}
          maxLength={LIMITS.bookAuthor}
          onChange={(e) => setAuthor(e.target.value)}
          error={errors.author}
          disabled={busy}
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            إلغاء
          </Button>
          <Button type="submit" busy={busy}>
            حفظ
          </Button>
        </div>
      </form>
    </Modal>
  );
}
