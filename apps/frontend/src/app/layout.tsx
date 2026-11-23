import type { Metadata } from 'next';
import { Cairo } from 'next/font/google';
import { AdhkarReminderScheduler } from '@/components/adhkar/AdhkarReminderScheduler';
import { BottomNav, MainFrame, TopBar } from '@/components/AppChrome';
import { AudioPlayerBar } from '@/components/audio/AudioPlayerBar';
import { FloatingCart } from '@/components/FloatingCart';
import { IntroSplash } from '@/components/IntroSplash';
import { Providers } from '@/components/Providers';
import { ReadingSettingsPanel } from '@/components/ReadingSettingsPanel';
import { ScrollReveal } from '@/components/ScrollReveal';
import { ScrollToTop } from '@/components/ScrollToTop';
import { BOOT_SCRIPT } from '@/lib/localStore';
import './globals.css';

/** Cairo for every non-Quran text (UI). Quran text keeps Amiri Quran (.quran-text). */
const cairo = Cairo({ subsets: ['arabic', 'latin'], display: 'swap', variable: '--font-cairo' });

export const metadata: Metadata = {
  title: { default: 'القرآن الكريم', template: '%s · القرآن الكريم' },
  description: 'قراءة القرآن الكريم والبحث فيه بالكتابة والصوت',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The boot script sets the theme class / font size before hydration.
    <html lang="ar" dir="rtl" className={cairo.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      {/* Browser extensions inject attributes on <body> (e.g. data-cjcrx) before hydration. */}
      <body className="min-h-screen antialiased" suppressHydrationWarning>
        <Providers>
          <TopBar />
          <MainFrame>{children}</MainFrame>
          <AudioPlayerBar />
          <BottomNav />
          <FloatingCart />
          <ReadingSettingsPanel />
          <ScrollToTop />
          <ScrollReveal />
          <AdhkarReminderScheduler />
          <IntroSplash />
        </Providers>
      </body>
    </html>
  );
}
