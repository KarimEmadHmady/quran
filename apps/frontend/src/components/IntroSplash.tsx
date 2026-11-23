'use client';

import { useEffect, useState } from 'react';

/** Shortest time the splash stays up, so it reads as an intro rather than a flash. */
const MIN_VISIBLE_MS = 900;
/** Matches the fade-out transition in globals.css (.intro-splash). */
const FADE_MS = 450;

/**
 * Intro / loading screen (design: "intro-loding.png"): the logo and tagline over a faint mosque
 * on the page background. It is server-rendered, so it covers the page from the first paint of
 * every full page load, and fades out once the app has hydrated (client-side navigation never
 * shows it again). Purely visual: it does not delay or change any data loading.
 */
export function IntroSplash() {
  const [hidden, setHidden] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const hide = setTimeout(() => setHidden(true), MIN_VISIBLE_MS);
    const remove = setTimeout(() => setGone(true), MIN_VISIBLE_MS + FADE_MS);
    return () => {
      clearTimeout(hide);
      clearTimeout(remove);
    };
  }, []);

  if (gone) return null;
  return (
    <div
      role="status"
      aria-label="جاري التحميل"
      data-hidden={hidden}
      className="intro-splash fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden bg-[var(--bg)]"
    >
      {/* Faint mosque silhouette behind the logo. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- decorative static image */}
      <img
        src="/mosque-bg.png"
        alt=""
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[8%] w-[150%] max-w-[56rem] -translate-x-1/2 select-none opacity-80 dark:opacity-[0.06]"
      />
      <div className="intro-logo relative flex flex-col items-center gap-8">
        {/* eslint-disable-next-line @next/next/no-img-element -- static logo, shown before hydration */}
        <img src="/logo-mark.png" alt="" aria-hidden width={256} height={256} className="w-[min(70vw,18rem)] dark:rounded-full dark:bg-[#f8f7f3] dark:p-6" />
        {/* The tagline is text (not part of the image) so it stays readable in dark mode. */}
        <p className="text-xl font-extrabold text-[var(--accent)]">معا نحو اتقان القرآن الكريم</p>
      </div>
    </div>
  );
}
