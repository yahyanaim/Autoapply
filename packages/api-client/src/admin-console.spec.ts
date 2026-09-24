import type {
  AdminConsoleStepUpResponse,
  AdminConsoleUserDetail,
  AdminConsoleUserSessionsResponse,
  AdminConsoleSessionsResponse,
  AdminConsoleUserUsageLimitsResponse,
  AdminConsoleActivityLogsResponse,
  AdminConsoleOverviewResponse,
  AdminConsoleUserMutationResponse,
  AdminConsoleRevokeUserSessionResponse,
  AdminConsoleRevokeUserSessionsResponse,
  AdminConsoleUserSummary,
  AdminConsoleUsersResponse,
} from '@applyai/shared-types';
import {
  AdminSessionStatus,
  SessionClientType,
  UserStatus,
} from '@applyai/shared-types';
import type { ApiClient } from './client';

declare const client: ApiClient;
declare const sanitizedUser: AdminConsoleUserSummary;

// @ts-expect-error Typed Admin client responses must not expose MFA enrollment state.
sanitizedUser.mfaEnabled;

const users: Promise<AdminConsoleUsersResponse> = client.adminConsole.users({
  cursor: 'opaque-cursor',
  limit: 20,
  status: UserStatus.active,
});
const user: Promise<AdminConsoleUserDetail> =
  client.adminConsole.user('user-1');
const sessions: Promise<AdminConsoleUserSessionsResponse> =
  client.adminConsole.userSessions('user-1', { limit: 20 });
const globalSessions: Promise<AdminConsoleSessionsResponse> =
  client.adminConsole.sessions({
    status: AdminSessionStatus.active,
    clientType: SessionClientType.web,
  });
const usageLimits: Promise<AdminConsoleUserUsageLimitsResponse> =
  client.adminConsole.userUsageLimits('ckz8dc7m40000qwertyuiop12');
const activityLogs: Promise<AdminConsoleActivityLogsResponse> =
  client.adminConsole.activityLogs({
    action: 'admin.user.suspend',
    targetType: 'user',
    createdFrom: '2026-09-01T00:00:00.000Z',
  });
const overview: Promise<AdminConsoleOverviewResponse> = client.adminConsole.overview();
const jobs = client.adminConsole.jobs({ limit: 20, eligibility: 'eligible' });
const job = client.adminConsole.job('ckz8dc7m40000qwertyuiop12');
const resumeFailures = client.adminConsole.resumeFailures({ limit: 20 });
const resumeFailure = client.adminConsole.resumeFailure('ckz8dc7m40000qwertyuiop12');
const betaGate = client.adminConsole.betaGate();
const notifications = client.adminConsole.notifications({ limit: 20 });
const applications = client.adminConsole.applications({});
const proof: Promise<AdminConsoleStepUpResponse> =
  client.adminConsole.issueStepUp({
    code: '123456',
    action: 'admin.user.suspend',
    targetType: 'user',
    targetId: 'user-1',
  });
const suspended: Promise<AdminConsoleUserMutationResponse> =
  client.adminConsole.suspendUser('user-1', {
    reason: 'policy violation',
    stepUpProof: 'proof',
  });
const reactivated: Promise<AdminConsoleUserMutationResponse> =
  client.adminConsole.reactivateUser('user-1', {
    stepUpProof: 'proof',
  });
const revokedSession: Promise<AdminConsoleRevokeUserSessionResponse> =
  client.adminConsole.revokeUserSession(
    'ckz8dc7m40000qwertyuiop12',
    '7d397356-f8f8-4f8e-9dce-5571bb1e24e0',
    { stepUpProof: 'proof' },
  );
const revokedSessions: Promise<AdminConsoleRevokeUserSessionsResponse> =
  client.adminConsole.revokeUserSessions('ckz8dc7m40000qwertyuiop12', {
    stepUpProof: 'proof',
  });

void users;
void user;
void sessions;
void globalSessions;
void usageLimits;
void activityLogs;
void overview;
void jobs;
void job;
void resumeFailures;
void resumeFailure;
void betaGate;
void notifications;
void applications;
void proof;
void suspended;
void reactivated;
void revokedSession;
void revokedSessions;
