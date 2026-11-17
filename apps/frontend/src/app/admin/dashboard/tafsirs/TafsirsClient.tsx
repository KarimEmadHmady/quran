'use client';

import { useEffect, useState } from 'react';
import { AyahSuggestField } from '@/components/admin/AyahSuggestField';
import { Alert, Button, EmptyState, ErrorState, PageTitle, Spinner } from '@/components/admin/ui';
import { statusOf } from '@/components/admin/useAdminData';
import { adminErrorMessage, parseAyahRefs } from '@/lib/admin';
import { adminApi, type AdminAyah, type AdminTafsirEntry } from '@/lib/adminApi';
import { TafsirText } from '@/components/TafsirText';

type View =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'ready'; ayah: AdminAyah; data: AdminTafsirEntry[] };

/** Read-only: every book's tafsir for one ayah, hidden (unconfirmed) books flagged. */
export function TafsirsClient({ initialAyahId }: { initialAyahId: number | null }) {
  const [input, setInput] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [view, setView] = useState<View>({ state: 'idle' });

  const load = async (ayahId: number) => {
    setView({ state: 'loading' });
    try {
      const res = await adminApi.tafsirs(ayahId);
      setView({ state: 'ready', ...res });
    } catch (err) {
      setView({ state: 'error', message: adminErrorMessage(statusOf(err), 'load') });
    }
  };

  useEffect(() => {
    if (initialAyahId) void load(initialAyahId);
  }, [initialAyahId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInputError(null);
    const { refs, invalid } = parseAyahRefs(input);
    if (invalid.length || refs.length !== 1) return setInputError('اكتب مرجع آية واحدة، مثل 2:255');
    setView({ state: 'loading' });
    try {
      const found = await adminApi.lookupAyahs([`${refs[0].sura}:${refs[0].ayah}`]);
      if (!found.data.length) {
        setView({ state: 'idle' });
        return setInputError('الآية غير موجودة');
      }
      await load(found.data[0].id);
    } catch (err) {
      setView({ state: 'error', message: adminErrorMessage(statusOf(err), 'load') });
    }
  };

  return (
    <>
      <PageTitle title="التفاسير" subtitle="عرض فقط: كل كتب التفسير لآية واحدة، مع تمييز الكتب المخفية" />
      <form onSubmit={submit} noValidate className="ui-card mb-5 flex flex-col gap-3 p-4 sm:flex-row sm:items-end" aria-label="عرض تفاسير آية">
        <div className="flex-1">
          <AyahSuggestField
            label="مرجع الآية"
            name="ref"
            placeholder="2:255 أو اكتب كلمات من الآية"
            value={input}
            onChange={(v) => {
              setInput(v);
              setInputError(null);
            }}
            error={inputError ?? undefined}
          />
        </div>
        <Button type="submit" busy={view.state === 'loading'}>
          عرض
        </Button>
      </form>

      {view.state === 'idle' && <EmptyState title="اختر آية" hint="اكتب المرجع (سورة:آية) لعرض تفاسيرها" />}
      {view.state === 'loading' && <Spinner />}
      {view.state === 'error' && <ErrorState message={view.message} />}
      {view.state === 'ready' && (
        <>
          <div className="ui-hero mb-4 p-4">
            <p className="mb-1 text-sm text-[var(--hero-muted)]" dir="ltr">
              {view.ayah.suraNumber}:{view.ayah.ayahNumber}
            </p>
            <p className="quran-text !text-2xl">{view.ayah.textUthmani}</p>
          </div>
          {view.data.length === 0 ? (
            <EmptyState title="لا يوجد تفسير لهذه الآية" />
          ) : (
            <div className="space-y-3" data-testid="tafsir-list">
              {view.data.some((t) => t.hidden) && (
                <Alert kind="info">الكتب المعلّمة «مخفي» لا يراها المستخدمون، وتظهر هنا للمراجعة فقط.</Alert>
              )}
              {view.data.map((t) => (
                <article key={t.bookId} className="ui-card p-4">
                  <header className="mb-2 flex items-center justify-between gap-2">
                    <h2 className="font-semibold">{t.bookName}</h2>
                    {t.hidden ? <span className="ui-badge ui-badge-blue">مخفي</span> : <span className="ui-badge ui-badge-green">ظاهر</span>}
                  </header>
                  <TafsirText content={t.content} className="text-sm" />
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
