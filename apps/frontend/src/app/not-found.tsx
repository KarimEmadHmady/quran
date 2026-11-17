import Link from 'next/link';

export default function NotFound() {
  return (
    <section className="space-y-3 py-10 text-center" data-no-restore>
      <h1 className="text-xl font-bold">الصفحة مش موجودة</h1>
      <p className="text-[var(--muted)]">الرابط غلط أو السورة/الموضوع مش موجود.</p>
      <p className="flex justify-center gap-4">
        <Link href="/surah" className="ui-chip">
          قائمة السور
        </Link>
        <Link href="/" className="ui-chip">
          الرئيسية
        </Link>
      </p>
    </section>
  );
}
