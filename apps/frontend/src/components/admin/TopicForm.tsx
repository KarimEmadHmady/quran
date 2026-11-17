'use client';

import { useEffect, useState } from 'react';
import { adminErrorMessage, LIMITS, validateTopic } from '@/lib/admin';
import { adminApi, type AdminTopic, type AdminTopicDetails } from '@/lib/adminApi';
import { Alert, Button, Field, Modal } from './ui';
import { statusOf } from './useAdminData';

/** Every topic (183 today), fetched page by page for the parent picker. */
export async function fetchAllTopics(signal?: AbortSignal): Promise<AdminTopic[]> {
  const out: AdminTopic[] = [];
  for (let page = 1; page <= 100; page++) {
    const res = await adminApi.topics({ page, limit: 100 }, signal);
    out.push(...res.data);
    if (page >= res.pagination.totalPages) break;
  }
  return out;
}

/** Create (no `topic`) or edit a topic: title, description, parent. Ban is a separate action. */
export function TopicForm({
  topic,
  defaultParentId = null,
  onClose,
  onSaved,
}: {
  topic?: AdminTopic | AdminTopicDetails;
  defaultParentId?: number | null;
  onClose: () => void;
  onSaved: (t: AdminTopicDetails) => void;
}) {
  const [title, setTitle] = useState(topic?.title ?? '');
  const [description, setDescription] = useState(topic?.description ?? '');
  const [parentId, setParentId] = useState<string>(String(topic ? (topic.parentId ?? '') : (defaultParentId ?? '')));
  const [parents, setParents] = useState<AdminTopic[] | null>(null);
  const [errors, setErrors] = useState<{ title?: string; description?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchAllTopics(ctrl.signal)
      .then(setParents)
      .catch(() => setParents([]));
    return () => ctrl.abort();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const v = validateTopic({ title, description });
    setErrors(v);
    if (v.title || v.description) return;
    const body = {
      title: title.trim(),
      description: description.trim() || null,
      parentId: parentId ? Number(parentId) : null,
    };
    setBusy(true);
    try {
      const saved = topic ? await adminApi.updateTopic(topic.id, body) : await adminApi.createTopic(body);
      onSaved(saved);
    } catch (err) {
      const status = statusOf(err);
      setFormError(
        status === 400 && parentId ? 'لا يمكن اختيار هذا الأب (غير موجود أو من فروع الموضوع نفسه)' : adminErrorMessage(status, 'save'),
      );
      setBusy(false);
    }
  };

  // A topic cannot move under itself; the server also rejects its descendants.
  const options = (parents ?? []).filter((p) => p.id !== topic?.id);

  return (
    <Modal title={topic ? 'تعديل الموضوع' : 'موضوع جديد'} onClose={onClose} busy={busy}>
      <form onSubmit={submit} noValidate className="space-y-4" aria-label={topic ? 'تعديل الموضوع' : 'موضوع جديد'}>
        {formError && <Alert kind="error">{formError}</Alert>}
        <Field
          label="العنوان"
          name="title"
          value={title}
          maxLength={LIMITS.topicTitle}
          onChange={(e) => setTitle(e.target.value)}
          error={errors.title}
          disabled={busy}
        />
        <Field
          label="الوصف (اختياري)"
          name="description"
          multiline
          value={description}
          maxLength={LIMITS.topicDescription}
          onChange={(e) => setDescription(e.target.value)}
          error={errors.description}
          disabled={busy}
        />
        <div className="space-y-1.5">
          <label htmlFor="topic-parent" className="block text-sm font-medium">
            الموضوع الأب
          </label>
          <select
            id="topic-parent"
            name="parentId"
            className="ui-input px-3 py-2.5"
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            disabled={busy || parents === null}
          >
            <option value="">— بدون (موضوع رئيسي) —</option>
            {options.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id} · {p.title}
                {p.isBanned ? ' (محظور)' : ''}
              </option>
            ))}
          </select>
          {parents === null && <p className="text-xs text-[var(--muted)]">جارٍ تحميل المواضيع…</p>}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            إلغاء
          </Button>
          <Button type="submit" busy={busy}>
            {topic ? 'حفظ التغييرات' : 'إضافة'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
