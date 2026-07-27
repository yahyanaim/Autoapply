'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { apiClient } from '@/lib/api/api-client';
import Link from 'next/link';
import { hasMinimumPlan, useSubscription } from '@/lib/api/hooks/use-subscription';

interface HandoffResponse {
  code: string;
  extensionId: string;
  expiresAt: string;
}

interface ExternalRuntime {
  sendMessage(
    extensionId: string,
    message: unknown,
    callback: (response?: { success?: boolean; error?: string }) => void,
  ): void;
  lastError?: { message?: string };
}

export default function ExtensionConnectPage() {
  const searchParams = useSearchParams();
  const requestedExtensionId = searchParams.get('extensionId');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const subscription = useSubscription();
  const hasPro = hasMinimumPlan(subscription.data, 'pro');

  const connect = async () => {
    setConnecting(true);
    setStatus('');
    setError('');
    try {
      const handoff = await apiClient.post<HandoffResponse>(
        '/auth/extension/handoff',
      );
      if (
        requestedExtensionId &&
        requestedExtensionId !== handoff.extensionId
      ) {
        throw new Error('The requested extension does not match this ApplyAI environment');
      }

      const runtime = (
        window as typeof window & { chrome?: { runtime?: ExternalRuntime } }
      ).chrome?.runtime;
      if (!runtime) {
        throw new Error(
          'ApplyAI could not contact the extension. Confirm it is installed and enabled.',
        );
      }

      await new Promise<void>((resolve, reject) => {
        runtime.sendMessage(
          handoff.extensionId,
          { type: 'APPLYAI_AUTH_HANDOFF', code: handoff.code },
          (response) => {
            const runtimeError = runtime.lastError?.message;
            if (runtimeError || !response?.success) {
              reject(
                new Error(
                  response?.error ||
                    runtimeError ||
                    'The extension rejected the connection',
                ),
              );
              return;
            }
            resolve();
          },
        );
      });
      setStatus('Extension connected. You can close this tab.');
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Could not connect the extension',
      );
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <h1 className="text-2xl font-bold text-gray-900">Connect extension</h1>
        <p className="mt-2 text-sm text-gray-500">
          Approve a short-lived, single-use connection for the official ApplyAI
          extension. The extension never sees your password.
        </p>
        {!subscription.isLoading && !hasPro && (
          <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Extension connection is available on Pro and Premium.
            <Button asChild size="sm" className="mt-3">
              <Link href="/billing">View plans</Link>
            </Button>
          </div>
        )}
        {status && (
          <div role="status" className="mt-6 rounded-lg border border-success-200 bg-success-50 p-3 text-sm text-success-700">
            {status}
          </div>
        )}
        {error && (
          <div role="alert" className="mt-6 rounded-lg border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">
            {error}
          </div>
        )}
        <Button
          type="button"
          className="mt-6"
          disabled={subscription.isLoading || !hasPro || connecting || Boolean(status)}
          onClick={() => void connect()}
        >
          {connecting ? 'Connecting…' : 'Approve connection'}
        </Button>
      </Card>
    </div>
  );
}
