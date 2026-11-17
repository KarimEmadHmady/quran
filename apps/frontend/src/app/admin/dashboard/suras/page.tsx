'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, EmptyState, ErrorState, Field, Modal, PageTitle, Spinner, useToast } from '@/components/admin/ui';
import { statusOf, useAdminData } from '@/components/admin/useAdminData';
import { Icon } from '@/components/Icon';
import { adminErrorMessage, LIMITS, validateSura } from '@/lib/admin';
import { adminApi, type AdminSura } from '@/lib/adminApi';

const PLACE: Record<string, string> = { meccan: 'مكية', medinan: 'مدنية' };

/** Sura names only: ayah count and text are fixed data. */
export default function SurasPage() {
  const toast = useToast();
  const { value, reload } = useAdminData((s) => adminApi.suras(s), []);
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState<AdminSura | null>(null);

  const rows = useMemo(() => {
    if (value.state !== 'ready') return [];
    const f = filter.trim().toLowerCase();
    return value.data.data.filter(
      (s) => !f || String(s.number) === f || s.nameAr.includes(f) || s.nameEn.toLowerCase().includes(f),
    );
  }, [value, filter]);

  return (
    <>
      <PageTitle title="السور" subtitle="تعديل أسماء السور (عدد الآيات ونصوصها ثابتة)" />
      <label htmlFor="sura-filter" className="sr-only">
        تصفية السور
      </label>
      <input
        id="sura-filter"
        type="search"
        className="ui-input mb-4 px-3 py-2.5 sm:max-w-sm"
        placeholder="رقم السورة أو اسمها…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      {value.state === 'loading' && <Spinner />}
      {value.state === 'error' && <ErrorState message={value.message} onRetry={reload} />}
      {value.state === 'ready' &&
        (rows.length === 0 ? (
          <EmptyState title="لا توجد نتائج" />
        ) : (
          <div className="ui-card relative overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm" data-testid="sura-table">
              <thead className="text-[var(--muted)]">
                <tr className="border-b border-[var(--border)] text-right">
                  <th className="p-3 font-medium">#</th>
                  <th className="p-3 font-medium">الاسم العربي</th>
                  <th className="p-3 font-medium">الاسم الإنجليزي</th>
                  <th className="p-3 font-medium">الآيات</th>
                  <th className="p-3 font-medium">النزول</th>
                  <th className="p-3 font-medium">
                    <span className="sr-only">إجراءات</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {rows.map((s) => (
                  <tr key={s.number}>
                    <td className="p-3 tabular-nums">{s.number}</td>
                    <td className="p-3 font-semibold">{s.nameAr}</td>
                    <td className="p-3" dir="ltr">
                      {s.nameEn}
                    </td>
                    <td className="p-3 tabular-nums">{s.ayahCount}</td>
                    <td className="p-3">{s.revelationPlace ? (PLACE[s.revelationPlace] ?? s.revelationPlace) : '—'}</td>
                    <td className="p-3 text-left">
                      <button type="button" className="ui-chip" onClick={() => setEditing(s)} aria-label={`تعديل سورة ${s.nameAr}`}>
                        <Icon name="edit" className="h-4 w-4" />
                        تعديل
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      {editing && (
        <SuraForm
          sura={editing}
          onClose={() => setEditing(null)}
          onSaved={(reindex) => {
            setEditing(null);
            toast(
              reindex === 'failed' ? 'error' : 'success',
              reindex === 'failed' ? 'تم الحفظ، لكن تعذّرت إعادة بناء فهرس البحث. أعد المحاولة من النظرة العامة.' : 'تم حفظ اسم السورة',
            );
            reload();
          }}
        />
      )}
    </>
  );
}

function SuraForm({
  sura,
  onClose,
  onSaved,
}: {
  sura: AdminSura;
  onClose: () => void;
  onSaved: (reindex: 'done' | 'failed') => void;
}) {
  const [nameAr, setNameAr] = useState(sura.nameAr);
  const [nameEn, setNameEn] = useState(sura.nameEn);
  const [errors, setErrors] = useState<{ nameAr?: string; nameEn?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const v = validateSura({ nameAr, nameEn });
    setErrors(v);
    if (v.nameAr || v.nameEn) return;
    const body: { nameAr?: string; nameEn?: string } = {};
    if (nameAr.trim() !== sura.nameAr) body.nameAr = nameAr.trim();
    if (nameEn.trim() !== sura.nameEn) body.nameEn = nameEn.trim();
    if (!body.nameAr && !body.nameEn) return onClose();
    setBusy(true);
    try {
      const res = await adminApi.updateSura(sura.number, body);
      onSaved(res.reindex);
    } catch (err) {
      const status = statusOf(err);
      setFormError(status === 409 ? 'اسم مستخدم لسورة أخرى' : adminErrorMessage(status, 'save'));
      setBusy(false);
    }
  };

  return (
    <Modal title={`سورة رقم ${sura.number}`} onClose={onClose} busy={busy}>
      <form onSubmit={submit} noValidate className="space-y-4" aria-label="تعديل اسم السورة">
        {formError && <Alert kind="error">{formError}</Alert>}
        <Field
          label="الاسم العربي"
          name="nameAr"
          value={nameAr}
          maxLength={LIMITS.suraName}
          onChange={(e) => setNameAr(e.target.value)}
          error={errors.nameAr}
          hint="يُستخدم في البحث بالمرجع (مثل «البقرة 255»)، وتغييره يعيد بناء فهرس البحث."
          disabled={busy}
        />
        <Field
          label="الاسم الإنجليزي"
          name="nameEn"
          dir="ltr"
          value={nameEn}
          maxLength={LIMITS.suraName}
          onChange={(e) => setNameEn(e.target.value)}
          error={errors.nameEn}
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
