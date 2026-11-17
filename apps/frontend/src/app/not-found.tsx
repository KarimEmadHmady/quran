import Link from 'next/link';

export default function NotFound() {
  return (
    <section className="space-y-3 py-10 text-center" data-no-restore>

<h1 className="text-xl font-bold">
  عذرًا، لم نعثر على ما تبحث عنه
</h1>
<p className="text-[var(--muted)]">
  قد يكون الرابط غير صحيح، أو أن الصفحة التي تبحث عنها لم تعد متاحة. يمكنك العودة ومتابعة رحلتك مع القرآن الكريم.
</p>

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
