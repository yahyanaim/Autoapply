import '@/app/globals.css';
import { Providers } from '@/components/providers';
import { FloatingCareerAssistant } from '@/components/career-chat/FloatingCareerAssistant';
import type { Metadata } from 'next';
import { IBM_Plex_Sans_Arabic } from 'next/font/google';

const ibmPlexSansArabic = IBM_Plex_Sans_Arabic({
  weight: ['300', '400', '500', '600', '700'],
  subsets: ['arabic'],
  display: 'swap',
  variable: '--font-ibm-plex-arabic',
});

export const metadata: Metadata = {
  title: 'ApplyAI — A Smarter Way to Land Your Next Job',
  description:
    'Find better-fit roles, optimize your resume, and manage every application with responsible AI.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        className={`${ibmPlexSansArabic.variable} min-h-screen bg-background font-sans text-foreground`}
      >
        <Providers>
          {children}
          <FloatingCareerAssistant />
        </Providers>
      </body>
    </html>
  );
}
