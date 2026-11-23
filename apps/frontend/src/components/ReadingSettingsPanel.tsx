'use client';

import { FONT_SIZE_MAX, FONT_SIZE_MIN } from '@/lib/shapes';
import { resolvedTheme, useSettingsStore } from '@/store/useSettingsStore';
import { useUiStore } from '@/store/useUiStore';
import { ReciterSelect } from './audio/ReciterSelect';
import { SurahReciterSelect } from './audio/SurahReciterSelect';
import { BottomSheet } from './BottomSheet';
import { Icon } from './Icon';

/** Gear button (top bar) that opens the settings sheet. */
export function SettingsButton() {
  const open = useUiStore((s) => s.open);
  const isOpen = useUiStore((s) => s.sheet === 'settings');
  return (
    <button
      type="button"
      onClick={() => open('settings')}
      aria-expanded={isOpen}
      aria-label="إعدادات القراءة"
      className="rounded-full p-2 text-[var(--fg)] hover:bg-[var(--surface-2)]"
    >
      <Icon name="settings" className="h-6 w-6" />
    </button>
  );
}

/** spec 4.2 settings (design: "الإعدادات" sheet). Changes apply immediately. */
export function ReadingSettingsPanel() {
  const isOpen = useUiStore((s) => s.sheet === 'settings');
  const close = useUiStore((s) => s.close);
  const { fontSize, theme, script, setFontSize, setTheme, setScript } = useSettingsStore();
  if (!isOpen) return null;

  const dark = resolvedTheme(theme) === 'dark';
  const seg = (active: boolean) =>
    `flex-1 rounded-xl px-3 py-2 text-sm transition ${
      active ? 'bg-[var(--primary-bg)] text-[var(--primary-fg)] font-semibold' : 'border border-[var(--border)]'
    }`;

  return (
    <BottomSheet label="إعدادات القراءة" onClose={close}>
      <div className="space-y-4">
        <h2 className="text-lg font-bold">الإعدادات</h2>
        <p className="ui-section-label">القراءة</p>
        <div className="divide-y divide-[var(--border)] rounded-2xl bg-[var(--surface-2)] px-4">
          <label className="block space-y-3 py-4 text-sm">
            <span className="flex justify-between">
              <span>حجم خط الآيات</span>
              <span className="font-semibold text-[var(--muted)]">{fontSize}</span>
            </span>
            <input
              type="range"
              min={FONT_SIZE_MIN}
              max={FONT_SIZE_MAX}
              step={1}
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              className="w-full accent-[var(--accent)]"
              aria-label="حجم خط الآيات"
            />
            <span className="quran-text block text-center">ٱلْحَمْدُ لِلَّهِ</span>
          </label>

          <div className="flex items-center justify-between py-4 text-sm">
            <span>
              الوضع الليلي
              {theme === null && <span className="block text-xs text-[var(--muted)]">حالياً بيتبع إعداد الجهاز.</span>}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={dark}
              aria-label="الوضع الليلي"
              onClick={() => setTheme(dark ? 'light' : 'dark')}
              className={`relative h-7 w-12 rounded-full transition ${dark ? 'bg-[var(--accent)]' : 'bg-[var(--track)]'}`}
            >
              <span
                className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${dark ? 'left-6' : 'left-1'}`}
              />
            </button>
          </div>
{/* 
          <fieldset className="space-y-3 py-4 text-sm">
            <legend className="mb-3">نص صفحات القراءة</legend>
            <div className="flex gap-2">
              <button type="button" className={seg(script === 'uthmani')} aria-pressed={script === 'uthmani'} onClick={() => setScript('uthmani')}>
                الرسم العثماني
              </button>
              <button type="button" className={seg(script === 'simple')} aria-pressed={script === 'simple'} onClick={() => setScript('simple')}>
                إملائي مبسّط
              </button>
            </div>
            <p className="text-xs text-[var(--muted)]">نتائج البحث بتفضل بالرسم العثماني.</p>
          </fieldset> */}
        </div>
        <p className="ui-section-label">التلاوة</p>
        <div className="rounded-2xl bg-[var(--surface-2)] px-4 py-4">
          <ReciterSelect label="قارئ الآيات" />
          <p className="mt-2 text-xs text-[var(--muted)]">لزر «استماع» على كل آية (ملف لكل آية).</p>
          <SurahReciterSelect className="mt-4" />
          <p className="mt-2 text-xs text-[var(--muted)]">لزر «تشغيل السورة كاملة» (ملف واحد للسورة).</p>
        </div>
      </div>
    </BottomSheet>
  );
}
