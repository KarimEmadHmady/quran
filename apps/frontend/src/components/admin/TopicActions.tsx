'use client';

import Link from 'next/link';
import { useState } from 'react';
import { adminErrorMessage } from '@/lib/admin';
import { adminApi, type AdminTopic, type AdminTopicDetails } from '@/lib/adminApi';
import { Icon } from '../Icon';
import { TopicForm } from './TopicForm';
import { ConfirmDialog } from './ui';
import { statusOf } from './useAdminData';

type Pending = 'ban' | 'delete' | null;

/** Edit / ban-unban / delete for one topic, each behind a form or a confirmation. */
export function TopicActions({
  topic,
  showManage = true,
  onChanged,
  onDeleted,
}: {
  topic: AdminTopic | AdminTopicDetails;
  showManage?: boolean;
  onChanged: (message: string) => void;
  onDeleted?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      if (pending === 'ban') {
        await adminApi.updateTopic(topic.id, { isBanned: !topic.isBanned });
        onChanged(topic.isBanned ? 'تم إلغاء الحظر' : 'تم حظر الموضوع');
      } else {
        await adminApi.deleteTopic(topic.id);
        onChanged('تم حذف الموضوع');
        onDeleted?.();
      }
      setPending(null);
    } catch (err) {
      setError(adminErrorMessage(statusOf(err), pending === 'delete' ? 'delete' : 'save'));
    } finally {
      setBusy(false);
    }
  };

  const btn = 'ui-chip';
  return (
    <div className="flex flex-wrap gap-2">
      {showManage && (
        <Link href={`/admin/dashboard/topics/${topic.id}`} className={btn}>
          <Icon name="link" className="h-4 w-4" />
          الآيات
        </Link>
      )}
      <button type="button" className={btn} onClick={() => setEditing(true)} aria-label={`تعديل ${topic.title}`}>
        <Icon name="edit" className="h-4 w-4" />
        تعديل
      </button>
      <button type="button" className={btn} onClick={() => setPending('ban')} aria-label={`${topic.isBanned ? 'إلغاء حظر' : 'حظر'} ${topic.title}`}>
        <Icon name="eyeOff" className="h-4 w-4" />
        {topic.isBanned ? 'إلغاء الحظر' : 'حظر'}
      </button>
      <button
        type="button"
        className={`${btn} text-[var(--danger)] disabled:opacity-40`}
        onClick={() => setPending('delete')}
        disabled={topic.childrenCount > 0}
        title={topic.childrenCount > 0 ? 'احذف المواضيع الفرعية أو انقلها أولاً' : undefined}
        aria-label={`حذف ${topic.title}`}
      >
        <Icon name="trash" className="h-4 w-4" />
        حذف
      </button>

      {editing && (
        <TopicForm
          topic={topic}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onChanged('تم حفظ التغييرات');
          }}
        />
      )}
      {pending && (
        <ConfirmDialog
          title={pending === 'delete' ? 'حذف الموضوع' : topic.isBanned ? 'إلغاء حظر الموضوع' : 'حظر الموضوع'}
          message={
            pending === 'delete' ? (
              <>
                سيتم حذف «{topic.title}» نهائياً مع ربطه بـ {topic.ayahCount} آية. الآيات نفسها لن تتأثر. لا يمكن التراجع.
              </>
            ) : topic.isBanned ? (
              <>سيظهر «{topic.title}» ومواضيعه الفرعية للمستخدمين مرة أخرى.</>
            ) : (
              <>سيختفي «{topic.title}» وكل مواضيعه الفرعية من التطبيق. يمكن إلغاء الحظر لاحقاً.</>
            )
          }
          confirmLabel={pending === 'delete' ? 'حذف نهائي' : topic.isBanned ? 'إلغاء الحظر' : 'حظر'}
          danger={pending === 'delete' || !topic.isBanned}
          busy={busy}
          error={error}
          onConfirm={run}
          onCancel={() => {
            setPending(null);
            setError(null);
          }}
        />
      )}
    </div>
  );
}
