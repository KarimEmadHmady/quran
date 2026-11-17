'use client';

/** Route error boundary: the API was unreachable or failed (never shows technical details). */
export default function RouteError({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className="space-y-3 py-10 text-center" role="alert" data-no-restore>
      <h1 className="text-xl font-bold">تعذّر تحميل الصفحة</h1>
      <p className="text-[var(--muted)]">الخادم مش متاح دلوقتي. جرّب تاني بعد شوية.</p>
      <button type="button" onClick={reset} className="ui-btn-primary px-6 py-2.5">
        إعادة المحاولة
      </button>
    </section>
  );
}
