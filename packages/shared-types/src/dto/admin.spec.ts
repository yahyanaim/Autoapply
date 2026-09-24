import type {
  AdminConsoleStepUpRequest,
  AdminConsoleSuspendUserRequest,
  AdminConsoleUserSummary,
  AdminConsoleUserSession,
  AdminConsoleSession,
  AdminConsoleUserUsageLimitsResponse,
  AdminConsoleActivityLogEvent,
  AdminConsoleOverviewResponse,
  AdminConsoleRevokeUserSessionsResponse,
  AdminConsoleJobSummary,
  AdminConsoleJobDetail,
  AdminConsoleDeactivateJobResponse,
  AdminConsoleResumeFailure,
  AdminConsoleBetaGateResponse,
  AdminConsoleNotificationFailure,
  AdminConsoleApplicationsResponse,
} from './admin';

declare const user: AdminConsoleUserSummary;

user.id satisfies string;
user.status satisfies 'active' | 'suspended';
user.plan satisfies 'free' | 'pro' | 'premium' | null;

// @ts-expect-error Admin responses must never expose password material.
user.passwordHash;
// @ts-expect-error Admin responses must never expose MFA material.
user.mfaSecretEncrypted;
// @ts-expect-error Admin responses must never expose MFA enrollment state.
user.mfaEnabled;
// @ts-expect-error Admin responses must never expose tokens.
user.refreshToken;
// @ts-expect-error Admin responses must never expose CV or resume payloads.
user.parsedJson;
// @ts-expect-error Admin responses must never expose payment data.
user.payments;
// @ts-expect-error Admin responses must never expose prompts.
user.prompt;
// @ts-expect-error Admin responses must never expose generated documents.
user.generatedDocument;
// @ts-expect-error Admin responses must never expose request bodies.
user.requestBody;
// @ts-expect-error Admin responses must never expose secrets.
user.secret;

declare const session: AdminConsoleUserSession;
session.clientType satisfies 'web' | 'extension';
// @ts-expect-error Session responses must never expose token hashes.
session.token;
// @ts-expect-error Session responses must never expose IP addresses.
session.ipAddress;
// @ts-expect-error Session responses must never expose MFA state.
session.mfaVerifiedAt;

declare const globalSession: AdminConsoleSession;
globalSession.userId satisfies string;
globalSession.sessionId satisfies string;
// @ts-expect-error Global session responses must not expose user identity data.
globalSession.email;
// @ts-expect-error Global session responses must not expose token hashes.
globalSession.tokenHash;

declare const usageLimits: AdminConsoleUserUsageLimitsResponse;
usageLimits.usage.aiRequests.remaining satisfies number | null;
// @ts-expect-error Usage responses must never expose payment history.
usageLimits.payments;
// @ts-expect-error Usage responses must never expose provider data.
usageLimits.provider;
// @ts-expect-error Usage responses must never expose MFA data.
usageLimits.mfaSecretEncrypted;

declare const activityLog: AdminConsoleActivityLogEvent;
activityLog.actorRef satisfies string | null;
activityLog.before?.status satisfies string | undefined;
// @ts-expect-error Activity log responses must never expose raw metadata.
activityLog.metadata;
// @ts-expect-error Activity log responses must never expose raw IP addresses.
activityLog.ipAddress;
// @ts-expect-error Activity log responses must never expose user agents.
activityLog.userAgent;
// @ts-expect-error Activity log responses must never expose credentials or MFA data.
activityLog.mfaSecretEncrypted;
// @ts-expect-error Activity log responses must never expose request bodies.
activityLog.requestBody;

declare const overview: AdminConsoleOverviewResponse;
overview.suspendedUserCount satisfies number;
// @ts-expect-error Active incidents are explicitly deferred from the overview contract.
overview.activeIncidentCount;
// @ts-expect-error Overview responses must never expose user identities.
overview.users;
// @ts-expect-error Overview responses must never expose sensitive session or token material.
overview.token;

const stepUp: AdminConsoleStepUpRequest = {
  code: '123456',
  action: 'admin.user.suspend',
  targetType: 'user',
  targetId: 'user-1',
};

const suspension: AdminConsoleSuspendUserRequest = {
  reason: 'policy violation',
  stepUpProof: 'proof',
};

declare const bulkRevocation: AdminConsoleRevokeUserSessionsResponse;
bulkRevocation.userId satisfies string;
bulkRevocation.revokedSessionCount satisfies number;
// @ts-expect-error Bulk revocation responses must never expose session identifiers.
bulkRevocation.sessionIds;
// @ts-expect-error Bulk revocation responses must never expose token material.
bulkRevocation.token;

void stepUp;
void suspension;
void bulkRevocation;

declare const operationalJob: AdminConsoleJobSummary;
operationalJob.lastObservedAt satisfies string;
operationalJob.status satisfies 'active' | 'deactivated';
// @ts-expect-error Job operations must never expose descriptions or captured-user data.
operationalJob.description;
// @ts-expect-error Job operations must never expose captured-user data.
operationalJob.capturedByUserId;

declare const operationalJobDetail: AdminConsoleJobDetail;
// @ts-expect-error Admin job details must never expose captured source URLs.
operationalJobDetail.sourceUrl;

declare const deactivatedJob: AdminConsoleDeactivateJobResponse;
deactivatedJob.status satisfies 'deactivated';
deactivatedJob.reason satisfies string;
// @ts-expect-error Deactivation responses must never expose actor identity.
deactivatedJob.deactivatedByUserId;
// @ts-expect-error Deactivation responses must never expose captured URLs.
deactivatedJob.sourceUrl;

declare const resumeFailure: AdminConsoleResumeFailure;
resumeFailure.failureCategory satisfies 'processing_failed';
// @ts-expect-error Resume failure operations must never expose parsed CV content.
resumeFailure.parsedJson;
// @ts-expect-error Resume failure operations must never expose file locations.
resumeFailure.originalFileUrl;

declare const betaGate: AdminConsoleBetaGateResponse;
betaGate.remainingSlots satisfies number;
// @ts-expect-error Beta reads never expose or mutate environment variables.
betaGate.environment;

declare const notificationFailure: AdminConsoleNotificationFailure;
notificationFailure.id satisfies string;
// @ts-expect-error Notification operations must never expose message bodies.
notificationFailure.body;
// @ts-expect-error Notification operations must never expose recipients.
notificationFailure.userId;

declare const applicationAggregate: AdminConsoleApplicationsResponse;
applicationAggregate.total satisfies number;
// @ts-expect-error Application operations are aggregate-only.
applicationAggregate.users;
// @ts-expect-error Application operations never expose Nori or career-chat data.
applicationAggregate.nori;
