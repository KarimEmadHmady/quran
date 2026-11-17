'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Alert, ErrorState, PageTitle, Pagination, Spinner } from '@/components/admin/ui';
import { useAdminData } from '@/components/admin/useAdminData';
import { adminApi } from '@/lib/adminApi';

/** Read-only browser: ayah text is never editable from the dashboard. */
export default function AyahsPage() {
  const suras = useAdminData((s) => adminApi.suras(s), []);
  const [sura, setSura] = useState(1);
  const [page, setPage] = useState(1);
  const ayahs = useAdminData((s) => adminApi.ayahs(sura, page, s), [sura, page]);

  return (
    <>
      <PageTitle title="الآيات" subtitle="عرض فقط: نصوص الآيات لا تُعدَّل من لوحة التحكم" />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label htmlFor="ayah-sura" className="block text-sm font-medium">
            السورة
          </label>
          <select
            id="ayah-sura"
            className="ui-input px-3 py-2.5"
            value={sura}
            onChange={(e) => {
              setSura(Number(e.target.value));
              setPage(1);
            }}
            disabled={suras.value.state !== 'ready'}
          >
            {suras.value.state === 'ready'
              ? suras.value.data.data.map((s) => (
                  <option key={s.number} value={s.number}>
                    {s.number}. {s.nameAr}
                  </option>
                ))
              : <option value={1}>1</option>}
          </select>
        </div>
      </div>
      <div className="mb-4">
        <Alert kind="info">للقراءة فقط. لربط آية بموضوع افتح الموضوع واكتب مرجعها.</Alert>
      </div>
      {ayahs.value.state === 'loading' && <Spinner />}
      {ayahs.value.state === 'error' && <ErrorState message={ayahs.value.message} onRetry={ayahs.reload} />}
      {ayahs.value.state === 'ready' && (
        <>
          <ol className="space-y-2" data-testid="ayah-list">
            {ayahs.value.data.data.map((a) => (
              <li key={a.id} className="ui-card flex items-start gap-3 p-3">
                <span className="ui-num">{a.ayahNumber}</span>
                <p className="quran-text min-w-0 flex-1 !text-xl !leading-[2.1]">{a.textUthmani}</p>
                <Link href={`/admin/dashboard/tafsirs?ayah=${a.id}`} className="ui-chip shrink-0">
                  التفاسير
                </Link>
              </li>
            ))}
          </ol>
          <Pagination {...ayahs.value.data.pagination} onPage={setPage} />
        </>
      )}
    </>
  );
}
