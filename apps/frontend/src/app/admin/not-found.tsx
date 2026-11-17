import Link from 'next/link';

export default function AdminNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4" data-no-restore>
      <div className="ui-card w-full max-w-sm p-6 text-center">
        <p className="text-4xl font-bold">404</p>
        <p className="mt-2 font-semibold">الصفحة غير موجودة</p>
        <Link href="/admin/dashboard" className="ui-chip mt-4">
          العودة للوحة التحكم
        </Link>
      </div>
    </div>
  );
}
