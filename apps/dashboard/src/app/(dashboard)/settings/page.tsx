'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { apiClient, SessionUser } from '@/lib/api/api-client';
import { useAuthStore } from '@/lib/stores/auth-store';

const profileSchema = z.object({
  fullName: z.string().trim().max(120, 'Name is too long').optional(),
  headline: z.string().trim().max(200, 'Headline is too long').optional(),
  location: z.string().trim().max(200, 'Location is too long').optional(),
  phone: z.string().trim().max(30, 'Phone number is too long').regex(
    /^[+()\d\s.-]{5,30}$/,
    'Enter a valid phone number',
  ).or(z.literal('')).optional(),
  linkedInUrl: z.string().trim().url('Enter a complete LinkedIn URL').max(500).or(z.literal('')).optional(),
  portfolioUrl: z.string().trim().url('Enter a complete portfolio URL').max(500).or(z.literal('')).optional(),
  visaStatus: z.string().trim().max(120, 'Work authorization is too long').optional(),
  desiredSalaryMin: z.number().int().min(0, 'Minimum salary cannot be negative').optional(),
  desiredSalaryMax: z.number().int().min(0, 'Maximum salary cannot be negative').optional(),
  remotePreference: z.enum(['remote', 'hybrid', 'onsite']).optional(),
}).refine(
  (profile) =>
    profile.desiredSalaryMin === undefined ||
    profile.desiredSalaryMax === undefined ||
    profile.desiredSalaryMin <= profile.desiredSalaryMax,
  {
    message: 'Maximum salary must be greater than or equal to minimum salary',
    path: ['desiredSalaryMax'],
  },
);
type ProfileFormData = z.infer<typeof profileSchema>;

interface ActiveSession {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  absoluteExpiresAt: string;
  clientType: 'web' | 'extension';
  current: boolean;
}

export default function SettingsPage() {
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [privacyBusy, setPrivacyBusy] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [mfaEnrollment, setMfaEnrollment] = useState<{
    secret: string;
    otpAuthUri: string;
  } | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<ProfileFormData>({ resolver: zodResolver(profileSchema) });

  useEffect(() => {
    reset({
      fullName: user?.profile?.fullName || '',
      headline: user?.profile?.headline || '',
      location: user?.profile?.location || '',
      phone: user?.profile?.phone || '',
      linkedInUrl: user?.profile?.linkedInUrl || '',
      portfolioUrl: user?.profile?.portfolioUrl || '',
      visaStatus: user?.profile?.visaStatus || '',
      desiredSalaryMin: user?.profile?.desiredSalaryMin ?? undefined,
      desiredSalaryMax: user?.profile?.desiredSalaryMax ?? undefined,
      remotePreference: user?.profile?.remotePreference ?? undefined,
    });
  }, [reset, user]);

  useEffect(() => {
    void apiClient
      .get<ActiveSession[]>('/auth/sessions')
      .then(setSessions)
      .catch((caught) => {
        setError(caught instanceof Error ? caught.message : 'Could not load active sessions');
      })
      .finally(() => setSessionsLoading(false));
  }, []);

  const save = async (data: ProfileFormData) => {
    if (!user) return;
    setMessage(''); setError('');
    try {
      const profile = await apiClient.put<NonNullable<SessionUser['profile']>>('/profile', data);
      setUser({ ...user, profile });
      setMessage('Profile saved.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save profile');
    }
  };

  const revokeSession = async (session: ActiveSession) => {
    setMessage(''); setError('');
    try {
      await apiClient.delete(`/auth/sessions/${session.id}`);
      if (session.current) {
        await useAuthStore.getState().logout();
        window.location.href = '/login';
        return;
      }
      setSessions((current) => current.filter((item) => item.id !== session.id));
      setMessage('Session revoked.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not revoke session');
    }
  };

  const revokeOtherSessions = async () => {
    setMessage(''); setError('');
    try {
      await apiClient.delete('/auth/sessions/others');
      setSessions((current) => current.filter((session) => session.current));
      setMessage('Other sessions revoked.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not revoke sessions');
    }
  };

  const acceptDataProcessing = async () => {
    setMessage(''); setError(''); setPrivacyBusy(true);
    try {
      await apiClient.post('/users/me/consent', {
        acceptDataProcessing: true,
      });
      const refreshedUser = await apiClient.get<SessionUser>('/auth/profile');
      setUser(refreshedUser);
      setMessage('Data-processing consent recorded.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not record consent');
    } finally {
      setPrivacyBusy(false);
    }
  };

  const exportPersonalData = async () => {
    setMessage(''); setError(''); setPrivacyBusy(true);
    try {
      const data = await apiClient.get<unknown>('/users/me/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'applyai-data-export.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage('Your data export was downloaded.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not export your data');
    } finally {
      setPrivacyBusy(false);
    }
  };

  const deleteAccount = async () => {
    if (deleteConfirmation !== 'DELETE MY ACCOUNT') return;
    setMessage(''); setError(''); setPrivacyBusy(true);
    try {
      await apiClient.delete('/users/me', {
        confirmation: deleteConfirmation,
      });
      apiClient.setToken(null);
      useAuthStore.setState({
        user: null,
        isAuthenticated: false,
        isInitialized: true,
      });
      window.location.href = '/login';
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not delete your account');
      setPrivacyBusy(false);
    }
  };

  const beginMfaSetup = async () => {
    setMessage(''); setError(''); setPrivacyBusy(true);
    try {
      const enrollment = await apiClient.post<{
        secret: string;
        otpAuthUri: string;
      }>('/auth/mfa/setup');
      setMfaEnrollment(enrollment);
      setMessage('Add the secret to your authenticator app, then confirm its code.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not start MFA setup');
    } finally {
      setPrivacyBusy(false);
    }
  };

  const confirmMfaSetup = async () => {
    setMessage(''); setError(''); setPrivacyBusy(true);
    try {
      await apiClient.post('/auth/mfa/confirm', { code: mfaCode });
      if (user) setUser({ ...user, mfaEnabled: true });
      setMfaEnrollment(null);
      setMfaCode('');
      setMessage('Authenticator MFA is enabled.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not confirm MFA');
    } finally {
      setPrivacyBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-gray-900">Settings</h1><p className="mt-1 text-sm text-gray-500">Manage the profile used across ApplyAI.</p></div>
      {message && <div role="status" className="rounded-lg border border-success-200 bg-success-50 p-3 text-sm text-success-700">{message}</div>}
      {error && <div role="alert" className="rounded-lg border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">{error}</div>}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="text-lg font-semibold text-gray-900">Profile and job preferences</h2>
          <p className="mt-1 text-sm text-gray-500">
            These preferences help ApplyAI explain whether an opportunity fits what you are looking for.
          </p>
          <form onSubmit={handleSubmit(save)} className="mt-6 space-y-4">
            <Input label="Full name" error={errors.fullName?.message} {...register('fullName')} />
            <Input label="Professional headline" error={errors.headline?.message} {...register('headline')} />
            <Input label="Location" error={errors.location?.message} {...register('location')} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                type="tel"
                autoComplete="tel"
                label="Phone"
                placeholder="+33 6 12 34 56 78"
                error={errors.phone?.message}
                {...register('phone')}
              />
              <Input
                type="url"
                autoComplete="url"
                label="LinkedIn URL"
                placeholder="https://www.linkedin.com/in/your-name"
                error={errors.linkedInUrl?.message}
                {...register('linkedInUrl')}
              />
            </div>
            <Input
              type="url"
              autoComplete="url"
              label="Portfolio or personal website"
              placeholder="https://your-portfolio.com"
              error={errors.portfolioUrl?.message}
              {...register('portfolioUrl')}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="remote-preference" className="block text-sm font-medium text-gray-700">
                  Workplace preference
                </label>
                <select
                  id="remote-preference"
                  className="h-10 w-full rounded-lg border border-input bg-white px-3 text-sm shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                  {...register('remotePreference', {
                    setValueAs: (value) => value || undefined,
                  })}
                >
                  <option value="">No preference</option>
                  <option value="remote">Remote</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="onsite">On-site</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="visa-status" className="block text-sm font-medium text-gray-700">
                  Work authorization
                </label>
                <select
                  id="visa-status"
                  className="h-10 w-full rounded-lg border border-input bg-white px-3 text-sm shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                  {...register('visaStatus', {
                    setValueAs: (value) => value || undefined,
                  })}
                >
                  <option value="">Prefer not to say</option>
                  <option value="citizen">Citizen</option>
                  <option value="permanent_resident">Permanent resident</option>
                  <option value="authorized">Authorized to work</option>
                  <option value="student_visa">Student visa</option>
                  <option value="sponsorship_required">Sponsorship required</option>
                  <option value="other">Other</option>
                </select>
                {errors.visaStatus?.message && (
                  <p className="text-xs text-danger-600">{errors.visaStatus.message}</p>
                )}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                type="number"
                min={0}
                step={1000}
                label="Desired salary minimum"
                placeholder="For example, 50000"
                error={errors.desiredSalaryMin?.message}
                {...register('desiredSalaryMin', {
                  setValueAs: (value) => value === '' ? undefined : Number(value),
                })}
              />
              <Input
                type="number"
                min={0}
                step={1000}
                label="Desired salary maximum"
                placeholder="For example, 70000"
                error={errors.desiredSalaryMax?.message}
                {...register('desiredSalaryMax', {
                  setValueAs: (value) => value === '' ? undefined : Number(value),
                })}
              />
            </div>
            <p className="text-xs leading-5 text-gray-500">
              Salary values use the currency shown in each job listing. ApplyAI does not send these preferences to employers.
            </p>
            <div className="flex justify-end"><Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save changes'}</Button></div>
          </form>
        </Card>
        <Card>
          <h2 className="text-lg font-semibold text-gray-900">Account</h2>
          <dl className="mt-4 space-y-4 text-sm"><div><dt className="text-gray-500">Email</dt><dd className="mt-1 break-all font-medium text-gray-900">{user?.email}</dd></div><div><dt className="text-gray-500">Role</dt><dd className="mt-1 font-medium capitalize text-gray-900">{user?.role.replace('_', ' ')}</dd></div><div><dt className="text-gray-500">Email status</dt><dd className="mt-1 font-medium text-gray-900">{user?.isEmailVerified ? 'Verified' : 'Not verified'}</dd></div></dl>
        </Card>
      </div>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Active sessions</h2>
            <p className="mt-1 text-sm text-gray-500">
              Review browsers and extensions that can access your account.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={sessions.filter((session) => !session.current).length === 0}
            onClick={() => void revokeOtherSessions()}
          >
            Revoke other sessions
          </Button>
        </div>
        <div className="mt-6 divide-y divide-gray-200">
          {sessionsLoading && <p className="py-4 text-sm text-gray-500">Loading sessions…</p>}
          {!sessionsLoading && sessions.length === 0 && (
            <p className="py-4 text-sm text-gray-500">No active sessions found.</p>
          )}
          {sessions.map((session) => (
            <div key={session.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-gray-900">
                    {session.userAgent || 'Unknown client'}
                  </p>
                  {session.current && (
                    <span className="rounded-full bg-success-50 px-3 py-1 text-xs font-medium text-success-700">
                      Current
                    </span>
                  )}
                  {session.clientType === 'extension' && (
                    <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-medium text-primary-700">
                      Extension
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {session.ipAddress || 'IP unavailable'} · Last used{' '}
                  {new Date(session.lastUsedAt).toLocaleString()}
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void revokeSession(session)}
              >
                {session.current ? 'Sign out' : 'Revoke'}
              </Button>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <h2 className="text-lg font-semibold text-gray-900">Multi-factor authentication</h2>
        <p className="mt-1 text-sm text-gray-500">
          Protect your account with a time-based code from an authenticator app.
          MFA is mandatory before organization or platform administrator access.
        </p>
        {user?.mfaEnabled ? (
          <p className="mt-4 text-sm font-medium text-success-700">
            Authenticator MFA is enabled.
          </p>
        ) : mfaEnrollment ? (
          <div className="mt-6 space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-900">
                Authenticator setup secret
              </p>
              <code className="mt-2 block break-all rounded-lg bg-gray-100 p-3 text-sm text-gray-900">
                {mfaEnrollment.secret}
              </code>
              <a
                href={mfaEnrollment.otpAuthUri}
                className="mt-2 inline-block text-sm font-medium text-primary-600 hover:text-primary-700"
              >
                Open in authenticator app
              </a>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="w-full max-w-xs">
                <Input
                  label="6-digit code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={mfaCode}
                  onChange={(event) =>
                    setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                />
              </div>
              <Button
                type="button"
                disabled={privacyBusy || !/^\d{6}$/.test(mfaCode)}
                onClick={() => void confirmMfaSetup()}
              >
                Confirm MFA
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            className="mt-4"
            disabled={privacyBusy}
            onClick={() => void beginMfaSetup()}
          >
            Set up authenticator
          </Button>
        )}
      </Card>
      <Card>
        <h2 className="text-lg font-semibold text-gray-900">Privacy and data</h2>
        <p className="mt-1 text-sm text-gray-500">
          Control consent, download a portable copy of your information, or
          permanently erase your account.
        </p>
        <div className="mt-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-900">
                Resume storage and AI processing
              </p>
              <p className="mt-1 text-sm text-gray-500">
                {user?.dataProcessingConsentAt
                  ? `Accepted on ${new Date(user.dataProcessingConsentAt).toLocaleDateString()}`
                  : 'Consent has not been recorded. Resume uploads and AI features remain disabled.'}
              </p>
            </div>
            {!user?.dataProcessingConsentAt && (
              <Button
                type="button"
                disabled={privacyBusy}
                onClick={() => void acceptDataProcessing()}
              >
                Accept
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-gray-200 pt-6">
            <div>
              <p className="text-sm font-medium text-gray-900">Export personal data</p>
              <p className="mt-1 text-sm text-gray-500">
                Download your account, resumes, applications, billing records,
                and activity as JSON. Passwords and tokens are excluded.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={privacyBusy}
              onClick={() => void exportPersonalData()}
            >
              Download export
            </Button>
          </div>
          <div className="border-t border-gray-200 pt-6">
            <p className="text-sm font-medium text-danger-700">Delete account</p>
            <p className="mt-1 text-sm text-gray-500">
              This permanently deletes your account and stored resume files and
              cancels an active Stripe subscription. This cannot be undone.
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="w-full max-w-md">
                <Input
                  label='Type "DELETE MY ACCOUNT" to confirm'
                  value={deleteConfirmation}
                  onChange={(event) => setDeleteConfirmation(event.target.value)}
                  autoComplete="off"
                />
              </div>
              <Button
                type="button"
                variant="danger"
                disabled={
                  privacyBusy || deleteConfirmation !== 'DELETE MY ACCOUNT'
                }
                onClick={() => void deleteAccount()}
              >
                Permanently delete
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
