'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AyahSuggestField } from '@/components/admin/AyahSuggestField';
import { TopicActions } from '@/components/admin/TopicActions';
import { TopicForm } from '@/components/admin/TopicForm';
import {
  Alert,
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  PageTitle,
  Pagination,
  Spinner,
  useToast,
} from '@/components/admin/ui';
import { statusOf, useAdminData } from '@/components/admin/useAdminData';
import { Icon } from '@/components/Icon';
import { adminErrorMessage, LIMITS, parseAyahRefs } from '@/lib/admin';
import { adminApi, type AdminAyah } from '@/lib/adminApi';

export function TopicDetailClient({ id }: { id: number }) {
  const router = useRouter();
  const toast = useToast();
  const topic = useAdminData((s) => adminApi.topic(id, s), [id]);
  const [page, setPage] = useState(1);
  const ayahs = useAdminData((s) => adminApi.topicAyahs(id, page, s), [id, page]);
  const [addingChild, setAddingChild] = useState(false);

  const refreshAll = () => {
    topic.reload();
    ayahs.reload();
  };

  if (topic.value.state === 'loading') return <Spinner />;
  if (topic.value.state === 'error') {
    return (
      <>
        <BackLink />
        <ErrorState message={topic.value.message} onRetry={topic.reload} />
      </>
    );
  }
  const t = topic.value.data;

  return (
    <>
      <BackLink />
      <PageTitle
        title={t.title}
        subtitle={`موضوع رقم ${t.id}${t.parent ? ` · تحت «${t.parent.title}»` : ' · موضوع رئيسي'}`}
        actions={
          <TopicActions
            topic={t}
            showManage={false}
            onChanged={(msg) => {
              toast('success', msg);
              refreshAll();
            }}
            onDeleted={() => router.replace('/admin/dashboard/topics')}
          />
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {t.isBanned && <span className="ui-badge bg-[var(--danger)] text-white">محظور</span>}
        {t.hidden ? (
          <span className="ui-badge ui-badge-blue">مخفي عن المستخدمين</span>
        ) : (
          <span className="ui-badge ui-badge-green">ظاهر للمستخدمين</span>
        )}
        <span className="ui-badge ui-badge-blue">{t.ayahCount} آية</span>
      </div>

      {t.description && <p className="ui-card mb-6 whitespace-pre-line p-4 text-sm leading-7">{t.description}</p>}

      <section className="mb-8" aria-labelledby="children-h">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="children-h" className="text-lg font-bold">
            المواضيع الفرعية ({t.children.length})
          </h2>
          <Button variant="ghost" onClick={() => setAddingChild(true)}>
            <Icon name="plus" className="h-4 w-4" />
            موضوع فرعي
          </Button>
        </div>
        {t.children.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">لا توجد مواضيع فرعية.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {t.children.map((c) => (
              <li key={c.id}>
                <Link href={`/admin/dashboard/topics/${c.id}`} className="ui-chip">
                  {c.title}
                  {c.isBanned && <span className="text-[var(--danger)]">(محظور)</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="ayahs-h">
        <h2 id="ayahs-h" className="mb-3 text-lg font-bold">
          الآيات المرتبطة
        </h2>
        <LinkAyahsForm
          topicId={id}
          onLinked={(msg) => {
            toast('success', msg);
            refreshAll();
          }}
        />
        <div className="mt-4">
          {ayahs.value.state === 'loading' && <Spinner />}
          {ayahs.value.state === 'error' && <ErrorState message={ayahs.value.message} onRetry={ayahs.reload} />}
          {ayahs.value.state === 'ready' &&
            (ayahs.value.data.data.length === 0 ? (
              <EmptyState title="لا توجد آيات مرتبطة" hint="أضف آيات بالمرجع، مثل 2:255" />
            ) : (
              <>
                <ul className="space-y-2" data-testid="linked-ayahs">
                  {ayahs.value.data.data.map((a) => (
                    <LinkedAyah
                      key={a.id}
                      topicId={id}
                      ayah={a}
                      onRemoved={() => {
                        toast('success', 'تم فك ربط الآية');
                        refreshAll();
                      }}
                    />
                  ))}
                </ul>
                <Pagination {...ayahs.value.data.pagination} onPage={setPage} />
              </>
            ))}
        </div>
      </section>

      {addingChild && (
        <TopicForm
          defaultParentId={id}
          onClose={() => setAddingChild(false)}
          onSaved={() => {
            setAddingChild(false);
            toast('success', 'تمت إضافة الموضوع الفرعي');
            topic.reload();
          }}
        />
      )}
    </>
  );
}

function BackLink() {
  return (
    <Link href="/admin/dashboard/topics" className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--fg)]">
      <Icon name="back" className="h-4 w-4" />
      كل المواضيع
    </Link>
  );
}

/** "2:255, 1:1-7" -> resolve each reference to an ayah id, then link them in one request. */
function LinkAyahsForm({ topicId, onLinked }: { topicId: number; onLinked: (msg: string) => void }) {
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const { refs, invalid } = parseAyahRefs(input);
    if (invalid.length) return setError(`مراجع غير صحيحة: ${invalid.slice(0, 5).join('، ')}`);
    if (!refs.length) return setError('اكتب مرجعاً واحداً على الأقل، مثل 2:255');
    if (refs.length > LIMITS.linkBatch) return setError(`الحد الأقصى ${LIMITS.linkBatch} آية في المرة`);

    setBusy(true);
    try {
      const found = await adminApi.lookupAyahs(refs.map((r) => `${r.sura}:${r.ayah}`));
      if (found.missing.length) {
        setError(`آيات غير موجودة: ${found.missing.slice(0, 5).join('، ')}`);
        return;
      }
      const res = await adminApi.linkAyahs(
        topicId,
        found.data.map((a) => a.id),
      );
      setInput('');
      onLinked(
        res.skipped.length
          ? `تمت إضافة ${res.added.length} آية (${res.skipped.length} مرتبطة من قبل)`
          : `تمت إضافة ${res.added.length} آية`,
      );
    } catch (err) {
      setError(adminErrorMessage(statusOf(err), 'link'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="ui-card space-y-3 p-4" aria-label="ربط آيات">
      <AyahSuggestField
        label="إضافة آيات بالمرجع"
        name="refs"
        placeholder="2:255, 1:1-7 أو اكتب كلمات من الآية"
        hint="سورة:آية، ويمكن كتابة مدى (1:1-7) أو عدة مراجع مفصولة بفاصلة. أو اكتب كلمات من نص الآية واختر من الاقتراحات."
        value={input}
        onChange={setInput}
        disabled={busy}
        multiple
      />
      {error && <Alert kind="error">{error}</Alert>}
      <Button type="submit" busy={busy}>
        <Icon name="link" className="h-4 w-4" />
        ربط
      </Button>
    </form>
  );
}

function LinkedAyah({ topicId, ayah, onRemoved }: { topicId: number; ayah: AdminAyah; onRemoved: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = `${ayah.suraNumber}:${ayah.ayahNumber}`;

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await adminApi.unlinkAyah(topicId, ayah.id);
      setConfirm(false);
      onRemoved();
    } catch (err) {
      setError(adminErrorMessage(statusOf(err), 'delete'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="ui-card flex items-start gap-3 p-3" data-testid="linked-ayah">
      <span className="ui-badge ui-badge-blue shrink-0" dir="ltr">
        {ref}
      </span>
      <p className="quran-text min-w-0 flex-1 !text-xl !leading-[2.1]">{ayah.textUthmani}</p>
      <button
        type="button"
        onClick={() => setConfirm(true)}
        className="rounded-xl p-2 text-[var(--danger)] hover:bg-[var(--surface-2)]"
        aria-label={`فك ربط الآية ${ref}`}
      >
        <Icon name="trash" />
      </button>
      {confirm && (
        <ConfirmDialog
          title="فك ربط الآية"
          message={`سيتم فك ربط الآية ${ref} من هذا الموضوع فقط. الآية نفسها لن تتأثر.`}
          confirmLabel="فك الربط"
          danger
          busy={busy}
          error={error}
          onConfirm={remove}
          onCancel={() => {
            setConfirm(false);
            setError(null);
          }}
        />
      )}
    </li>
  );
}
