import {
  SessionClientType,
  AdminSessionStatus,
  SubscriptionPlan,
  UserRole,
  UserStatus,
  ApplicationStatus,
  NotificationChannel,
  NotificationStatus,
  RemoteType,
  JobStatus,
  JobDeactivationReason,
  ResumeParseFailureCategory,
  ResumeRequeueReason,
  QuotaGrantCategory,
  QuotaGrantReason,
} from '../enums';

export type AdminConsoleUserAction =
  | 'admin.user.suspend'
  | 'admin.user.reactivate'
  | 'admin.session.revoke'
  | 'admin.session.revoke_all'
  | 'admin.job.deactivate'
  | 'admin.resume.requeue'
  | 'admin.quota.grant';

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
  reason?: string;
  failureCategory?: string;
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
  targetType: 'user' | 'session' | 'job' | 'resume';
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

export interface AdminConsoleQuotaGrantRequest {
  category: QuotaGrantCategory;
  amount: number;
  expiresAt: string;
  reason: QuotaGrantReason;
  idempotencyKey: string;
  stepUpProof: string;
}

/** Sanitized grant confirmation; excludes proofs, keys, fingerprints, and identity data. */
export interface AdminConsoleQuotaGrantResponse {
  grantId: string;
  targetUserId: string;
  category: QuotaGrantCategory;
  amount: number;
  expiresAt: string;
  status: 'active' | 'expired';
  createdAt: string;
  effectiveLimit: number | null;
  remaining: number | null;
}

export type AdminConsoleJobEligibility = 'eligible' | 'stale';

export interface AdminConsoleJobsRequest {
  cursor?: string;
  limit?: number;
  search?: string;
  source?: string;
  eligibility?: AdminConsoleJobEligibility;
}

export interface AdminConsoleJobSummary {
  id: string;
  title: string;
  company: string | null;
  source: string | null;
  location: string | null;
  remoteType: RemoteType | null;
  status: JobStatus;
  lastObservedAt: string;
  eligible: boolean;
  createdAt: string;
}

export interface AdminConsoleJobsResponse {
  jobs: AdminConsoleJobSummary[];
  limit: number;
  nextCursor: string | null;
}

export interface AdminConsoleJobDetail extends AdminConsoleJobSummary {
  salaryMin: number | null;
  salaryMax: number | null;
  skills: string[];
  deactivatedAt: string | null;
  deactivationReason: JobDeactivationReason | null;
  updatedAt: string;
}

export interface AdminConsoleDeactivateJobRequest {
  reason: JobDeactivationReason;
  stepUpProof: string;
}

export interface AdminConsoleDeactivateJobResponse {
  jobId: string;
  status: JobStatus.deactivated;
  deactivatedAt: string;
  reason: JobDeactivationReason;
}

export interface AdminConsoleResumeFailuresRequest {
  cursor?: string;
  limit?: number;
}

export interface AdminConsoleResumeFailure {
  resumeId: string;
  status: 'failed';
  failureCategory: ResumeParseFailureCategory;
  requeueable: boolean;
  mimeType: string | null;
  executionCount: number;
  lastAttempt: number | null;
  lastAttemptAt: string | null;
  createdAt: string;
  failedAt: string;
}

export interface AdminConsoleRequeueResumeRequest {
  reason: ResumeRequeueReason;
  stepUpProof: string;
  idempotencyKey: string;
}

export interface AdminConsoleRequeueResumeResponse {
  resumeId: string;
  requeueRequestId: string;
  status: 'requeue_requested';
  requestedAt: string;
}

export interface AdminConsoleResumeFailuresResponse {
  failures: AdminConsoleResumeFailure[];
  limit: number;
  nextCursor: string | null;
}

export interface AdminConsoleBetaGateResponse {
  enabled: boolean;
  registrationCount: number;
  capacity: number;
  remainingSlots: number;
  status: 'disabled' | 'open' | 'full';
  updatedAt: string;
}

export interface AdminConsoleNotificationsRequest {
  cursor?: string;
  limit?: number;
  createdFrom?: string;
  createdTo?: string;
}

export interface AdminConsoleNotificationFailure {
  id: string;
  channel: NotificationChannel;
  status: NotificationStatus.failed;
  createdAt: string;
  sentAt: string | null;
}

export interface AdminConsoleNotificationsResponse {
  period: { from: string; to: string };
  rollup: {
    total: number;
    pending: number;
    sent: number;
    failed: number;
    read: number;
  };
  failures: AdminConsoleNotificationFailure[];
  limit: number;
  nextCursor: string | null;
}

export interface AdminConsoleApplicationsRequest {
  createdFrom?: string;
  createdTo?: string;
}

export interface AdminConsoleApplicationsResponse {
  period: { from: string; to: string };
  total: number;
  byStatus: Record<ApplicationStatus, number>;
}

export interface AdminConsoleMetricsRequest {
  /** Inclusive UTC calendar day in YYYY-MM-DD form. */
  from: string;
  /** Inclusive UTC calendar day in YYYY-MM-DD form; maximum range is 90 days. */
  to: string;
}

export interface AdminConsoleMetricsDay {
  day: string;
  requestCount: number;
  costedRequestCount: number;
  /** Recorded estimated operational cost, never settled provider cost. */
  estimatedCostUsd: number;
}

export interface AdminConsoleBillingMetricsDay {
  /** UTC calendar day. The migration day can be partial. */
  day: string;
  coverage: 'complete' | 'partial';
  activePaidSubscriptions: number;
  activePaidSubscriptionsByPlan: {
    pro: number;
    premium: number;
  };
  /** End-of-day MRR in USD cents. */
  monthlyRecurringRevenueMinor: number;
  newPaidSubscriptions: number;
  expansionMrrMinor: number;
  contractionMrrMinor: number;
  churnCount: number;
  churnedMrrMinor: number;
  reactivationCount: number;
}

export interface AdminConsoleBillingMovementTotals {
  newPaidSubscriptions: number;
  expansionMrrMinor: number;
  contractionMrrMinor: number;
  churnCount: number;
  churnedMrrMinor: number;
  reactivationCount: number;
}

export interface AdminConsoleFinancialMetricsDay {
  /** UTC calendar day. The metrics-boundary day can be partial. */
  day: string;
  coverage: 'complete' | 'partial';
  /** Successful Stripe invoice payments in USD cents. */
  grossRevenueMinor: number;
  successfulPaymentCount: number;
  /** Recorded estimated operational AI cost, never settled provider cost. */
  estimatedAiCostUsd: number;
  costedRequestCount: number;
}

export interface AdminConsoleFinancialMetricsTotals {
  grossRevenueMinor: number;
  successfulPaymentCount: number;
  estimatedAiCostUsd: number;
  costedRequestCount: number;
}

export interface AdminConsoleStripeFeeMetricsDay {
  day: string;
  coverage: 'complete' | 'partial';
  /** Exact recorded Stripe BalanceTransaction.fee, USD minor units. */
  feeMinor: number;
  feeEffectCount: number;
}

export interface AdminConsoleStripeFeeMetricsTotals {
  feeMinor: number;
  feeEffectCount: number;
}

export interface AdminConsoleRecordedFinancialAmounts {
  /** All signed components are USD cents; refunds and withdrawals are already negative. */
  grossRevenueMinor: number;
  refundAdjustmentMinor: number;
  disputeWithdrawalMinor: number;
  disputeReinstatementMinor: number;
  recordedStripeFeeMinor: number;
  recordedNetRevenueMinor: number;
  /** Integer micro-USD, never settled provider cost or net profit. */
  estimatedAiCostMicroUsd: number;
  estimatedContributionMarginMicroUsd: number;
}

export interface AdminConsoleRecordedFinancialDay extends AdminConsoleRecordedFinancialAmounts {
  day: string;
  coverage: 'complete' | 'partial';
}

export interface AdminConsoleRecordedFinancials extends Omit<AdminConsoleCoverage, 'boundary' | 'activationAt'> {
  currency: 'usd';
  costType: 'estimated';
  totals: AdminConsoleRecordedFinancialAmounts | null;
  daily: AdminConsoleRecordedFinancialDay[];
}

export interface AdminConsoleMetricsResponse {
  period: {
    from: string;
    to: string;
    timeZone: 'UTC';
    maximumDays: 90;
  };
  billing: {
    asOf: string;
    currency: 'usd';
    activePaidSubscriptions: number;
    activePaidSubscriptionsByPlan: {
      pro: number;
      premium: number;
    };
    /** Current MRR in USD cents from active Pro and Premium subscriptions. */
    monthlyRecurringRevenueMinor: number;
    history: {
      /** No transition history exists before this deployment boundary. */
      historyAvailableFrom: string;
      requestedRangeStartsBeforeHistory: boolean;
      actualCoveredRange: {
        from: string;
        toExclusive: string;
      } | null;
      /** Null when the requested range is entirely before available history. */
      totals: AdminConsoleBillingMovementTotals | null;
      daily: AdminConsoleBillingMetricsDay[];
    };
  };
  ai: {
    costType: 'estimated';
    currency: 'usd';
    requestCount: number;
    costedRequestCount: number;
    estimatedCostUsd: number;
    daily: AdminConsoleMetricsDay[];
  };
  financials: {
    /** No revenue or financial AI-cost history exists before this boundary. */
    metricsStartAt: string;
    requestedRangeStartsBeforeMetrics: boolean;
    actualCoveredRange: {
      from: string;
      toExclusive: string;
    } | null;
    currency: 'usd';
    /** Null when the requested range is entirely before metricsStartAt. */
    totals: AdminConsoleFinancialMetricsTotals | null;
    daily: AdminConsoleFinancialMetricsDay[];
  };
  stripeFees: {
    metricsStartAt: string;
    requestedRangeStartsBeforeMetrics: boolean;
    actualCoveredRange: { from: string; toExclusive: string } | null;
    currency: 'usd';
    totals: AdminConsoleStripeFeeMetricsTotals | null;
    daily: AdminConsoleStripeFeeMetricsDay[];
  };
  financialEvidenceCoverage: AdminConsoleCoverage & {
    unresolvedCaseCount: number;
    evidencedZeroCount: number;
  };
  estimatedAiCostCoverage: AdminConsoleCoverage & {
    unresolvedRequestCount: number;
    costType: 'estimated';
  };
  /** Known ingested evidence only; not provider-wide or bank reconciliation. */
  recordedFinancials: AdminConsoleRecordedFinancials;
}

export interface AdminConsoleCoverage {
  status: 'full' | 'partial' | 'unresolved' | 'unavailable';
  boundary: string;
  activationAt: string | null;
  asOf: string;
  requestedRange: { from: string; toExclusive: string };
  actualCoveredRange: { from: string; toExclusive: string } | null;
}
