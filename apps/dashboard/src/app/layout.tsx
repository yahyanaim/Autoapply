import '@/app/globals.css';
import { Providers } from '@/components/providers';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ApplyAI — A Smarter Way to Land Your Next Job',
  description: 'Find better-fit roles, optimize your resume, and manage every application with responsible AI.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
