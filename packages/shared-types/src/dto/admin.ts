import {
  SessionClientType,
  AdminSessionStatus,
  SubscriptionPlan,
  UserRole,
  UserStatus,
} from '../enums';

export type AdminConsoleUserAction =
  | 'admin.user.suspend'
  | 'admin.user.reactivate'
  | 'admin.session.revoke'
  | 'admin.session.revoke_all';

/** Deliberately excludes credentials, MFA material, tokens, CVs, and billing data. */
export interface AdminConsoleUserSummary {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  plan: SubscriptionPlan | null;
  isEmailVerified: boolean;
  suspendedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminConsoleUsersRequest {
  cursor?: string;
  limit?: number;
  search?: string;
  role?: UserRole;
  status?: UserStatus;
  plan?: SubscriptionPlan;
}

export interface AdminConsoleUsersResponse {
  users: AdminConsoleUserSummary[];
  limit: number;
  nextCursor: string | null;
}

export type AdminConsoleUserDetail = AdminConsoleUserSummary;

export interface AdminConsoleUserSessionsRequest {
  cursor?: string;
  limit?: number;
}

export interface AdminConsoleUserSession {
  id: string;
  clientType: SessionClientType;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  current: boolean;
}

export interface AdminConsoleUserSessionsResponse {
  sessions: AdminConsoleUserSession[];
  limit: number;
  nextCursor: string | null;
}

export interface AdminConsoleSessionsRequest {
  cursor?: string;
  limit?: number;
  clientType?: SessionClientType;
  status?: AdminSessionStatus;
  createdFrom?: string;
  createdTo?: string;
  lastUsedFrom?: string;
  lastUsedTo?: string;
}

export interface AdminConsoleSession {
  userId: string;
  sessionId: string;
  clientType: SessionClientType;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  current: boolean;
}

export interface AdminConsoleSessionsResponse {
  sessions: AdminConsoleSession[];
  limit: number;
  nextCursor: string | null;
}

export interface AdminConsoleUsageCategory {
  used: number;
  limit: number | null;
  remaining: number | null;
  unlimited: boolean;
}

/** Billing-owned limits only; excludes payment, provider, and content data. */
export interface AdminConsoleUserUsageLimitsResponse {
  userId: string;
  plan: SubscriptionPlan;
  period: string;
  resetAt: string;
  usage: {
    applications: AdminConsoleUsageCategory;
    aiRequests: AdminConsoleUsageCategory;
    resumeOptimizations: AdminConsoleUsageCategory;
    jobDiscoveries: AdminConsoleUsageCategory;
    resumes: AdminConsoleUsageCategory;
    storageBytes: AdminConsoleUsageCategory;
  };
}

/** Strictly redacted state transition fields from the administrative audit stream. */
export interface AdminConsoleActivityLogSnapshot {
  status?: string;
  role?: string;
  plan?: string;
  enabled?: boolean;
  suspendedAt?: string | null;
}

export interface AdminConsoleActivityLogsRequest {
  cursor?: string;
  limit?: number;
  action?: string;
  actorUserId?: string;
  targetType?: string;
  targetId?: string;
  createdFrom?: string;
  createdTo?: string;
}

/** Deliberately omits raw metadata, network data, credentials, and content. */
export interface AdminConsoleActivityLogEvent {
  id: string;
  createdAt: string;
  action: string | null;
  targetType: string | null;
  targetId: string | null;
  actorRef: string | null;
  correlationId: string | null;
  before: AdminConsoleActivityLogSnapshot | null;
  after: AdminConsoleActivityLogSnapshot | null;
}

export interface AdminConsoleActivityLogsResponse {
  events: AdminConsoleActivityLogEvent[];
  limit: number;
  nextCursor: string | null;
}

/** Aggregate-only Admin Console overview; active incidents are explicitly deferred. */
export interface AdminConsoleOverviewResponse {
  suspendedUserCount: number;
}

export interface AdminConsoleStepUpRequest {
  code: string;
  action: AdminConsoleUserAction;
  targetType: 'user' | 'session';
  targetId: string;
}

export interface AdminConsoleStepUpResponse {
  proof: string;
  expiresAt: string;
}

export interface AdminConsoleSuspendUserRequest {
  reason: string;
  stepUpProof: string;
}

export interface AdminConsoleReactivateUserRequest {
  stepUpProof: string;
}

export interface AdminConsoleRevokeUserSessionRequest {
  stepUpProof: string;
}

export interface AdminConsoleRevokeUserSessionResponse {
  userId: string;
  sessionId: string;
  status: 'revoked';
}

export interface AdminConsoleRevokeUserSessionsRequest {
  stepUpProof: string;
}

export interface AdminConsoleRevokeUserSessionsResponse {
  userId: string;
  revokedSessionCount: number;
}

export interface AdminConsoleUserMutationResponse {
  userId: string;
  status: UserStatus;
  suspendedAt?: string | null;
}
