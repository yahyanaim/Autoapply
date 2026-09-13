'use client';

import { useEffect } from 'react';
import { captureBrowserException } from '../lib/observability/sentry';

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    captureBrowserException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main className="mx-auto flex min-h-screen max-w-xl items-center px-6">
          <div>
            <p className="text-sm font-medium text-orange-600">ApplyAI</p>
            <h1 className="mt-2 text-2xl font-semibold">Something went wrong</h1>
            <p className="mt-3 text-muted-foreground">
              Please refresh the page and try again. Your application data has not been sent.
            </p>
          </div>
        </main>
      </body>
    </html>
  );
}
