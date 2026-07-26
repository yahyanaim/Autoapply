import React, { useEffect, useState } from 'react';
import { DASHBOARD_BASE_URL } from '../shared/config';

interface ResumeSummary {
  id: string;
  fileName: string | null;
  isPrimary: boolean;
  parseStatus: 'ready';
}

function sendMessage<T>(message: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: T) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(response);
    });
  });
}

export function OptionsApp() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [resumes, setResumes] = useState<ResumeSummary[]>([]);
  const [selectedResume, setSelectedResume] = useState('');
  const [autofillPreference, setAutofillPreference] = useState<'assistive' | 'auto-off'>(
    'assistive',
  );
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    void Promise.all([
      chrome.storage.local.get(['selectedResume', 'autofillPreference']),
      sendMessage<{ authenticated: boolean }>({ type: 'GET_AUTH_STATE' }),
    ]).then(async ([settings, auth]) => {
      setSelectedResume(typeof settings.selectedResume === 'string' ? settings.selectedResume : '');
      if (settings.autofillPreference === 'auto-off') setAutofillPreference('auto-off');
      setIsAuthenticated(auth.authenticated);
      if (auth.authenticated) {
        const result = await sendMessage<{ resumes?: ResumeSummary[]; error?: string }>({
          type: 'LIST_RESUMES',
        });
        if (result.resumes) {
          setResumes(result.resumes);
          const storedResume =
            typeof settings.selectedResume === 'string'
              ? settings.selectedResume
              : '';
          if (!result.resumes.some((resume) => resume.id === storedResume)) {
            const fallbackResume =
              result.resumes.find((resume) => resume.isPrimary)?.id ??
              result.resumes[0]?.id ??
              '';
            setSelectedResume(fallbackResume);
            if (fallbackResume) {
              await chrome.storage.local.set({ selectedResume: fallbackResume });
            } else {
              await chrome.storage.local.remove('selectedResume');
            }
          }
        }
      }
    });
  }, []);

  const connectInDashboard = async () => {
    const url = new URL('/extension/connect', DASHBOARD_BASE_URL);
    url.searchParams.set('extensionId', chrome.runtime.id);
    await chrome.tabs.create({ url: url.toString() });
  };

  const handleLogout = async () => {
    await sendMessage({ type: 'LOGOUT' });
    setIsAuthenticated(false);
    setResumes([]);
    setSelectedResume('');
    await chrome.storage.local.remove('selectedResume');
    setMessage('Signed out');
  };

  const handleSave = async () => {
    setIsSaving(true);
    setMessage('');
    try {
      await chrome.storage.local.set({ selectedResume, autofillPreference });
      setMessage('Settings saved successfully');
    } catch {
      setMessage('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 font-sans">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <div className="mb-8">
          <div className="mb-2 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-lg font-bold text-white">
              A
            </div>
            <h1 className="text-2xl font-bold text-gray-900">ApplyAI Settings</h1>
          </div>
          <p className="text-sm text-gray-500">Connect your account and configure assistive autofill.</p>
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl bg-white p-6 shadow-card">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Account</h2>
            {isAuthenticated ? (
              <div className="flex items-center justify-between gap-4 rounded-xl bg-success-light p-4">
                <div>
                  <div className="text-sm font-medium text-gray-900">Account connected</div>
                  <div className="text-xs text-gray-500">Tokens are stored only in extension storage.</div>
                </div>
                <button className="text-sm font-medium text-danger" onClick={handleLogout} type="button">
                  Sign out
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-500">
                  Connect through the signed-in ApplyAI dashboard. Your password
                  is never entered into or shared with the extension.
                </p>
                <button
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  onClick={() => void connectInDashboard()}
                  type="button"
                >
                  Connect in dashboard
                </button>
              </div>
            )}
          </section>

          <section className="rounded-2xl bg-white p-6 shadow-card">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Resume</h2>
            <label className="mb-2 block text-sm font-medium text-gray-700" htmlFor="default-resume">
              Default resume
            </label>
            <select
              id="default-resume"
              value={selectedResume}
              onChange={(event) => setSelectedResume(event.target.value)}
              disabled={!isAuthenticated || resumes.length === 0}
              className="w-full rounded-xl border border-gray-200 bg-gray-100 px-4 py-3 text-sm disabled:opacity-60"
            >
              <option value="">Select a resume…</option>
              {resumes.map((resume) => (
                <option key={resume.id} value={resume.id}>
                  {resume.fileName || 'Untitled resume'}{resume.isPrimary ? ' (primary)' : ''}
                </option>
              ))}
            </select>
            {isAuthenticated && resumes.length === 0 && (
              <p className="mt-2 text-xs text-warning">Upload a resume in the dashboard first.</p>
            )}
          </section>

          <section className="rounded-2xl bg-white p-6 shadow-card">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Autofill</h2>
            <fieldset className="space-y-3">
              <legend className="mb-2 text-sm font-medium text-gray-700">Mode</legend>
              {([
                ['assistive', 'Assistive — fill supported fields for review'],
                ['auto-off', 'Off — match scoring only'],
              ] as const).map(([value, label]) => (
                <label key={value} className="flex items-center gap-3 rounded-xl bg-gray-100 p-4 text-sm">
                  <input
                    type="radio"
                    name="autofill"
                    value={value}
                    checked={autofillPreference === value}
                    onChange={() => setAutofillPreference(value)}
                  />
                  {label}
                </label>
              ))}
            </fieldset>
          </section>

          <div className="flex items-center gap-4">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="rounded-xl bg-primary px-6 py-3 text-sm font-medium text-white disabled:opacity-50"
              type="button"
            >
              {isSaving ? 'Saving…' : 'Save settings'}
            </button>
            {message && (
              <span className="text-sm text-gray-700" role="status" aria-live="polite">
                {message}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
