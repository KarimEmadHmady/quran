'use client';

import { toPng } from 'html-to-image';
import { useEffect, useRef, useState } from 'react';
import { downloadBlob, tafsirsForAyah } from '@/lib/api';
import { SHARE_CARD_WIDTH, SHARE_PIXEL_RATIO, shareFileName, shareFontSize } from '@/lib/shareImage';
import { tafsirParagraphs } from '@/lib/tafsirFormat';

export interface ShareTarget {
  ayahId: number;
  suraName: string;
  suraNumber: number;
  ayahNumber: number;
  textUthmani: string;
  /** Cart items may name a tafsir book; otherwise every confirmed book is used. */
  tafsirBookId?: number;
}

/** "download": verse only or verse + tafsir, saved as a file. "share": the verse image, shared. */
export type ImageAction = 'download' | 'share';
/** What the downloaded image contains. */
export type ImageContent = 'ayah' | 'ayah_tafsir';
type Content = ImageContent;
type Tafsir = { bookName: string; content: string };

const toArabicDigits = (n: number) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);

/**
 * spec 4.4: a designed card (Uthmani text + sura / ayah, optionally the tafsir) rendered to PNG
 * with html-to-image. The card is rendered off-screen at full size and the preview shows the
 * actual PNG, so what you see is exactly what gets downloaded or shared.
 */
export function ShareAsImageModal({
  target,
  action = 'share',
  content: fixedContent,
  onClose,
}: {
  target: ShareTarget;
  action?: ImageAction;
  /** Fixes the download content (cart "Include Tafsir" checkbox); otherwise the user picks. */
  content?: ImageContent;
  onClose: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [content, setContent] = useState<Content>(fixedContent ?? 'ayah');
  const [tafsir, setTafsir] = useState<Tafsir[] | null>(null);
  const [tafsirError, setTafsirError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [png, setPng] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const withTafsir = action === 'download' && content === 'ayah_tafsir';

  // The tafsir is loaded only when "with tafsir" is chosen.
  useEffect(() => {
    if (!withTafsir || tafsir !== null) return;
    const ctrl = new AbortController();
    setTafsirError(false);
    tafsirsForAyah(target.ayahId, ctrl.signal)
      .then((rows) => {
        const chosen = target.tafsirBookId === undefined ? rows : rows.filter((r) => r.bookId === target.tafsirBookId);
        setTafsir((chosen.length ? chosen : rows).map((r) => ({ bookName: r.bookName, content: r.content })));
      })
      .catch(() => !ctrl.signal.aborted && setTafsirError(true));
    return () => ctrl.abort();
  }, [withTafsir, tafsir, target.ayahId, target.tafsirBookId, retry]);

  const ready = !withTafsir || tafsir !== null;

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setPng(null);
    setError('');
    (async () => {
      try {
        // Fonts must be ready, or the PNG falls back to a system font.
        await document.fonts.load(`${shareFontSize(target.textUthmani)}px "Amiri Quran"`);
        await document.fonts.ready;
        const node = cardRef.current;
        if (!node) return;
        const url = await toPng(node, {
          pixelRatio: SHARE_PIXEL_RATIO,
          width: SHARE_CARD_WIDTH,
          cacheBust: true,
          backgroundColor: '#0f3d33',
        });
        if (!cancelled) setPng(url);
      } catch {
        if (!cancelled) setError('تعذّر إنشاء الصورة.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [target, ready, withTafsir, tafsir]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const fileName = () => {
    const base = shareFileName(target.suraNumber, target.ayahNumber);
    return withTafsir ? base.replace(/\.png$/, '-tafsir.png') : base;
  };
  const blob = async () => (await fetch(png!)).blob();

  const download = async () => {
    if (!png) return;
    setBusy(true);
    setError('');
    try {
      downloadBlob(await blob(), fileName());
    } catch {
      setError('تعذّر تحميل الصورة.');
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    if (!png) return;
    setBusy(true);
    setError('');
    try {
      const file = new File([await blob()], fileName(), { type: 'image/png' });
      if (!navigator.canShare?.({ files: [file] })) {
        setError('المشاركة غير مدعومة على هذا الجهاز. استخدم «تحميل» بدلاً منها.');
        return;
      }
      await navigator.share({ files: [file], title: `سورة ${target.suraName} - آية ${target.ayahNumber}` });
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setError('تعذّرت المشاركة.');
    } finally {
      setBusy(false);
    }
  };

  const fontSize = shareFontSize(target.textUthmani);
  const option = (value: Content, label: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={content === value}
      onClick={() => setContent(value)}
      className={`flex-1 rounded-xl px-3 py-2 text-sm transition ${
        content === value ? 'bg-[var(--primary-bg)] font-semibold text-[var(--primary-fg)]' : 'border border-[var(--border)]'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={action === 'download' ? 'تحميل الآية كصورة' : 'مشاركة الآية كصورة'}
    >
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative flex max-h-full w-full max-w-lg flex-col gap-3 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-2xl">
        <header className="flex items-center justify-between">
          <h2 className="font-bold">{action === 'download' ? 'تحميل كصورة' : 'مشاركة كصورة'}</h2>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="text-xl">
            ×
          </button>
        </header>

        {action === 'download' && !fixedContent && (
          <div role="radiogroup" aria-label="محتوى الصورة" className="flex gap-2">
            {option('ayah', 'الآية فقط')}
            {option('ayah_tafsir', 'الآية مع التفسير')}
          </div>
        )}

        <div className="min-h-40 overflow-y-auto rounded-2xl bg-[var(--surface-2)]">
          {png ? (
            <img src={png} alt={`سورة ${target.suraName} - آية ${target.ayahNumber}`} className="w-full" />
          ) : (
            !error &&
            !tafsirError && (
              <p className="p-6 text-center text-[var(--muted)]">
                {withTafsir && tafsir === null ? 'جاري تحميل التفسير…' : 'جاري تجهيز الصورة…'}
              </p>
            )
          )}
        </div>
        {tafsirError && (
          <p role="alert" className="text-sm text-[var(--danger)]">
            تعذّر تحميل التفسير.{' '}
            <button type="button" className="underline" onClick={() => setRetry((n) => n + 1)}>
              إعادة المحاولة
            </button>
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-[var(--danger)]">
            {error}
          </p>
        )}
        {action === 'download' ? (
          <button type="button" disabled={!png || busy} onClick={download} className="ui-btn-primary px-4 py-3">
            {busy ? '…' : withTafsir ? 'تحميل الآية مع التفسير' : 'تحميل الآية'}
          </button>
        ) : (
          <button type="button" disabled={!png || busy} onClick={share} className="ui-btn-primary px-4 py-3">
            {busy ? '…' : 'مشاركة'}
          </button>
        )}
      </div>

      {/* Off-screen, full-size card that is captured (fixed width, automatic height). */}
      <div aria-hidden style={{ position: 'fixed', left: -100_000, top: 0 }}>
        <div
          ref={cardRef}
          dir="rtl"
          lang="ar"
          data-share-card
          style={{
            width: SHARE_CARD_WIDTH,
            boxSizing: 'border-box',
            padding: '88px 80px 64px',
            background: 'linear-gradient(160deg, #0f3d33 0%, #13584a 100%)',
            color: '#fdf8ec',
            fontFamily: "'Amiri Quran', serif",
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 28, opacity: 0.8, marginBottom: 40 }}>﷽</div>
          <p
            style={{
              fontSize,
              lineHeight: 2.15,
              margin: 0,
              overflowWrap: 'anywhere',
              whiteSpace: 'normal',
            }}
          >
            {target.textUthmani} <span style={{ color: '#e8c872' }}>﴿{toArabicDigits(target.ayahNumber)}﴾</span>
          </p>
          {withTafsir && tafsir && tafsir.length > 0 && (
            <div
              style={{
                marginTop: 48,
                paddingTop: 32,
                borderTop: '1px solid rgba(253,248,236,0.25)',
                textAlign: 'justify',
                fontFamily: 'var(--font-ui)',
              }}
            >
              {tafsir.map((t, i) => (
                <div key={i} style={{ marginTop: i ? 36 : 0 }}>
                  <div style={{ color: '#e8c872', fontSize: 30, fontWeight: 700, marginBottom: 16 }}>{t.bookName}</div>
                  {tafsirParagraphs(t.content).map((para, j) => (
                    <p key={j} style={{ fontSize: 28, lineHeight: 1.9, margin: j ? '18px 0 0' : 0, whiteSpace: 'pre-line' }}>
                      {para}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          )}
          <div
            style={{
              marginTop: 56,
              paddingTop: 28,
              borderTop: '1px solid rgba(253,248,236,0.25)',
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 30,
            }}
          >
            <span>
              سورة {target.suraName} · آية {toArabicDigits(target.ayahNumber)}
            </span>
            <span style={{ opacity: 0.7 }}>القرآن الكريم</span>
          </div>
        </div>
      </div>
    </div>
  );
}
