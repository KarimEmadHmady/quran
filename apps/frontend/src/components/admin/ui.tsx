'use client';

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { rangeLabel } from '@/lib/admin';
import { Icon } from '../Icon';

/* Shared dashboard building blocks: all styled with the app's design tokens (globals.css). */

export function Spinner({ label = 'جارٍ التحميل…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 py-10 text-sm text-[var(--muted)]">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]" aria-hidden />
      {label}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="ui-card px-6 py-10 text-center" data-testid="empty-state">
      <p className="font-semibold">{title}</p>
      {hint && <p className="mt-1 text-sm text-[var(--muted)]">{hint}</p>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="ui-card border-[var(--danger)] px-6 py-8 text-center">
      <p className="text-[var(--danger)]">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="ui-chip mt-4">
          إعادة المحاولة
        </button>
      )}
    </div>
  );
}

export function Alert({ kind, children }: { kind: 'error' | 'info' | 'success'; children: React.ReactNode }) {
  const color =
    kind === 'error'
      ? 'border-[var(--danger)] text-[var(--danger)]'
      : kind === 'success'
        ? 'border-[var(--success)] text-[var(--success)]'
        : 'border-[var(--accent)] text-[var(--accent)]';
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={`rounded-xl border bg-[var(--surface)] px-4 py-3 text-sm ${color}`}>
      {children}
    </div>
  );
}

/** Labeled input / textarea with an inline error (aria-invalid + aria-describedby). */
export function Field({
  label,
  error,
  hint,
  multiline,
  ...props
}: {
  label: string;
  error?: string;
  hint?: string;
  multiline?: boolean;
} & React.InputHTMLAttributes<HTMLInputElement> &
  React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  const common = {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
    className: `ui-input px-3 py-2.5 ${error ? '!border-[var(--danger)]' : ''}`,
  };
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {multiline ? (
        <textarea rows={4} {...(props as React.TextareaHTMLAttributes<HTMLTextAreaElement>)} {...common} />
      ) : (
        <input {...(props as React.InputHTMLAttributes<HTMLInputElement>)} {...common} />
      )}
      {error ? (
        <p id={`${id}-err`} className="text-xs text-[var(--danger)]">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="text-xs text-[var(--muted)]">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

export function Button({
  variant = 'primary',
  busy,
  children,
  className = '',
  ...props
}: { variant?: 'primary' | 'ghost' | 'danger'; busy?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const styles = {
    primary: 'ui-btn-primary',
    ghost: 'rounded-xl border border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--accent)]',
    danger: 'rounded-xl bg-[var(--danger)] font-semibold text-white disabled:opacity-50',
  }[variant];
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || busy}
      aria-busy={busy || undefined}
      className={`inline-flex items-center justify-center gap-2 px-4 py-2 text-sm ${styles} ${className}`}
    >
      {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
      {children}
    </button>
  );
}

/** Centered dialog (Esc / backdrop close it unless `busy`); focus moves into it on open. */
export function Modal({
  title,
  onClose,
  busy,
  children,
}: {
  title: string;
  onClose: () => void;
  busy?: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    const first = ref.current?.querySelector<HTMLElement>('input, textarea, select, button');
    first?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [busy]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="absolute inset-0 bg-black/60" onClick={() => !busy && onClose()} />
      <div
        ref={ref}
        className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-2xl sm:rounded-2xl"
      >
        <header className="mb-4 flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-lg font-bold">
            {title}
          </h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label="إغلاق" className="rounded-full p-1 hover:bg-[var(--surface-2)]">
            <Icon name="close" />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal title={title} onClose={onCancel} busy={busy}>
      <div className="space-y-4">
        <div className="text-sm leading-7">{message}</div>
        {error && <Alert kind="error">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            إلغاء
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} busy={busy} data-testid="confirm-button">
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function Pagination({
  page,
  limit,
  total,
  totalPages,
  onPage,
}: {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  onPage: (p: number) => void;
}) {
  if (total === 0) return null;
  return (
    <nav aria-label="الصفحات" className="mt-4 flex items-center justify-between gap-3 text-sm">
      <span className="text-[var(--muted)]">{rangeLabel(page, limit, total)}</span>
      <div className="flex gap-2">
        <button type="button" className="ui-chip disabled:opacity-40" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          السابق
        </button>
        <span className="ui-chip" aria-current="page">
          {page} / {Math.max(1, totalPages)}
        </span>
        <button
          type="button"
          className="ui-chip disabled:opacity-40"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          التالي
        </button>
      </div>
    </nav>
  );
}

// ------------------------------------------------------------------ toasts

interface Toast {
  id: number;
  kind: 'success' | 'error';
  text: string;
}
const ToastContext = createContext<(kind: Toast['kind'], text: string) => void>(() => undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            data-testid="toast"
            className={`pointer-events-auto rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg ${
              t.kind === 'error' ? 'bg-[var(--danger)] text-white' : 'bg-[var(--primary-bg)] text-[var(--primary-fg)]'
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

export function PageTitle({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-[var(--muted)]">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
