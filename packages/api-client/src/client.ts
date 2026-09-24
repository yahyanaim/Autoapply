import axios, { AxiosInstance, AxiosError } from 'axios';
import { ApiError } from './errors';
import type {
  AdminConsoleReactivateUserRequest,
  AdminConsoleStepUpRequest,
  AdminConsoleStepUpResponse,
  AdminConsoleSuspendUserRequest,
  AdminConsoleUserMutationResponse,
  AdminConsoleRevokeUserSessionRequest,
  AdminConsoleRevokeUserSessionResponse,
  AdminConsoleRevokeUserSessionsRequest,
  AdminConsoleRevokeUserSessionsResponse,
  AdminConsoleUserDetail,
  AdminConsoleUsersRequest,
  AdminConsoleUsersResponse,
  AdminConsoleUserSessionsRequest,
  AdminConsoleUserSessionsResponse,
  AdminConsoleSessionsRequest,
  AdminConsoleSessionsResponse,
  AdminConsoleUserUsageLimitsResponse,
  AdminConsoleActivityLogsRequest,
  AdminConsoleActivityLogsResponse,
  AdminConsoleOverviewResponse,
  AdminConsoleJobsRequest,
  AdminConsoleJobsResponse,
  AdminConsoleJobDetail,
  AdminConsoleResumeFailuresRequest,
  AdminConsoleResumeFailuresResponse,
  AdminConsoleResumeFailure,
  AdminConsoleBetaGateResponse,
  AdminConsoleNotificationsRequest,
  AdminConsoleNotificationsResponse,
  AdminConsoleApplicationsRequest,
  AdminConsoleApplicationsResponse,
} from '@applyai/shared-types';
import type {
  AuthLoginRequest,
  AuthLoginResponse,
  AuthRegisterRequest,
  AuthRegisterResponse,
  AuthRefreshRequest,
  AuthRefreshResponse,
  ResumeUploadRequest,
  ResumeUploadResponse,
  ResumeListResponse,
  ResumeVersionsResponse,
  ResumeOptimizeRequest,
  ResumeOptimizeResponse,
  JobSearchRequest,
  JobSearchResponse,
  JobDiscoveryRequest,
  JobDiscoveryResponse,
  ApplicationCreateRequest,
  ApplicationPrepareRequest,
  ApplicationCreateResponse,
  ApplicationUpdateRequest,
  ApplicationUpdateResponse,
  ApplicationRegenerateRequest,
  ApplicationRegenerateResponse,
  AiMatchScoreRequest,
  AiMatchScoreTextRequest,
  AiMatchScoreResponse,
  AiOptimizeRequest,
  AiOptimizeResponse,
  AiCoverLetterRequest,
  AiCoverLetterResponse,
  BillingCheckoutRequest,
  BillingCheckoutResponse,
  BillingPortalResponse,
  AdminUsersResponse,
  AdminMetricsResponse,
} from './types';

export interface ApiClientOptions {
  client?: 'browser' | 'extension';
}

export class ApiClient {
  private http: AxiosInstance;

  constructor(baseURL: string, options: ApiClientOptions = {}) {
    this.http = axios.create({
      baseURL,
      withCredentials: options.client !== 'extension',
      headers: {
        'Content-Type': 'application/json',
        ...(options.client === 'extension'
          ? { 'X-ApplyAI-Client': 'extension' }
          : {}),
      },
    });

    this.http.interceptors.response.use(
      (response) => response,
      (error: AxiosError<{ message?: string; code?: string }>) => {
        const status = error.response?.status ?? 500;
        const message = error.response?.data?.message ?? error.message;
        const code = error.response?.data?.code ?? 'UNKNOWN_ERROR';
        throw new ApiError(status, message, code);
      },
    );
  }

  setToken(token: string | null) {
    if (!token) return this.clearToken();
    this.http.defaults.headers.common.Authorization = `Bearer ${token}`;
  }

  clearToken() {
    delete this.http.defaults.headers.common['Authorization'];
  }

  auth = {
    login: async (data: AuthLoginRequest): Promise<AuthLoginResponse> => {
      const res = await this.http.post<AuthLoginResponse>('/auth/login', data);
      return res.data;
    },

    register: async (
      data: AuthRegisterRequest,
    ): Promise<AuthRegisterResponse> => {
      const res = await this.http.post<AuthRegisterResponse>(
        '/auth/register',
        data,
      );
      return res.data;
    },

    refresh: async (
      data: AuthRefreshRequest = {},
    ): Promise<AuthRefreshResponse> => {
      const res = await this.http.post<AuthRefreshResponse>(
        '/auth/refresh',
        data,
      );
      return res.data;
    },

    logout: async (): Promise<void> => {
      try {
        await this.http.post('/auth/logout');
      } finally {
        this.clearToken();
      }
    },
  };

  resumes = {
    upload: async (
      data: ResumeUploadRequest,
    ): Promise<ResumeUploadResponse> => {
      const formData = new FormData();
      formData.append('file', data.file);
      const res = await this.http.post<ResumeUploadResponse>(
        '/resumes',
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
        },
      );
      return res.data;
    },

    list: async (): Promise<ResumeListResponse> => {
      const res = await this.http.get<ResumeListResponse>('/resumes');
      return res.data;
    },

    versions: async (resumeId: string): Promise<ResumeVersionsResponse> => {
      const res = await this.http.get<ResumeVersionsResponse>(
        `/resumes/${resumeId}/versions`,
      );
      return res.data;
    },

    downloadGeneratedPdf: async (
      resumeId: string,
      versionId: string,
    ): Promise<Blob> => {
      const res = await this.http.get<Blob>(
        `/resumes/${resumeId}/versions/${versionId}/pdf`,
        { responseType: 'blob' },
      );
      return res.data;
    },

    optimize: async (
      resumeId: string,
      data: ResumeOptimizeRequest,
    ): Promise<ResumeOptimizeResponse> => {
      const { idempotencyKey, ...payload } = data;
      const res = await this.http.post<ResumeOptimizeResponse>(
        `/resumes/${resumeId}/optimize`,
        payload,
        {
          headers: {
            'Idempotency-Key':
              idempotencyKey ??
              `sdk-resume-optimize:${globalThis.crypto.randomUUID()}`,
          },
        },
      );
      return res.data;
    },
  };

  jobs = {
    search: async (params: JobSearchRequest): Promise<JobSearchResponse> => {
      const res = await this.http.get<JobSearchResponse>('/jobs/search', {
        params,
      });
      return res.data;
    },

    discover: async (
      data: JobDiscoveryRequest,
    ): Promise<JobDiscoveryResponse> => {
      const { idempotencyKey, ...payload } = data;
      const res = await this.http.post<JobDiscoveryResponse>(
        '/jobs/discover',
        payload,
        {
          headers: {
            'Idempotency-Key':
              idempotencyKey ??
              `sdk-discover:${globalThis.crypto.randomUUID()}`,
          },
        },
      );
      return res.data;
    },
  };

  applications = {
    create: async (
      data: ApplicationCreateRequest,
    ): Promise<ApplicationCreateResponse> => {
      const { idempotencyKey, ...payload } = data;
      const res = await this.http.post<ApplicationCreateResponse>(
        '/applications',
        payload,
        {
          headers: {
            'Idempotency-Key':
              idempotencyKey ?? `sdk-create:${globalThis.crypto.randomUUID()}`,
          },
        },
      );
      return res.data;
    },

    prepare: async (
      data: ApplicationPrepareRequest,
    ): Promise<ApplicationCreateResponse> => {
      const { idempotencyKey, ...payload } = data;
      const res = await this.http.post<ApplicationCreateResponse>(
        '/applications/prepare',
        payload,
        {
          headers: {
            'Idempotency-Key':
              idempotencyKey ?? `sdk-prepare:${globalThis.crypto.randomUUID()}`,
          },
        },
      );
      return res.data;
    },

    update: async (
      id: string,
      data: ApplicationUpdateRequest,
    ): Promise<ApplicationUpdateResponse> => {
      const res = await this.http.patch<ApplicationUpdateResponse>(
        `/applications/${id}`,
        data,
      );
      return res.data;
    },

    regenerate: async (
      id: string,
      data: ApplicationRegenerateRequest,
    ): Promise<ApplicationRegenerateResponse> => {
      const { idempotencyKey, ...payload } = data;
      const res = await this.http.post<ApplicationRegenerateResponse>(
        `/applications/${id}/regenerate`,
        payload,
        {
          headers: {
            'Idempotency-Key':
              idempotencyKey ??
              `sdk-application-regenerate:${globalThis.crypto.randomUUID()}`,
          },
        },
      );
      return res.data;
    },
  };

  ai = {
    matchScore: async (
      data: AiMatchScoreRequest,
    ): Promise<AiMatchScoreResponse> => {
      const res = await this.http.post<AiMatchScoreResponse>(
        '/ai/match-score',
        data,
      );
      return res.data;
    },

    matchScoreText: async (
      data: AiMatchScoreTextRequest,
    ): Promise<AiMatchScoreResponse> => {
      const res = await this.http.post<AiMatchScoreResponse>(
        '/ai/match-score-text',
        data,
      );
      return res.data;
    },

    optimize: async (data: AiOptimizeRequest): Promise<AiOptimizeResponse> => {
      const { idempotencyKey, ...payload } = data;
      const res = await this.http.post<AiOptimizeResponse>(
        '/ai/optimize',
        payload,
        {
          headers: {
            'Idempotency-Key':
              idempotencyKey ??
              `sdk-ai-optimize:${globalThis.crypto.randomUUID()}`,
          },
        },
      );
      return res.data;
    },

    coverLetter: async (
      data: AiCoverLetterRequest,
    ): Promise<AiCoverLetterResponse> => {
      const { idempotencyKey, ...payload } = data;
      const res = await this.http.post<AiCoverLetterResponse>(
        '/ai/cover-letter',
        payload,
        {
          headers: {
            'Idempotency-Key':
              idempotencyKey ??
              `sdk-cover-letter:${globalThis.crypto.randomUUID()}`,
          },
        },
      );
      return res.data;
    },
  };

  billing = {
    checkout: async (
      data: BillingCheckoutRequest,
    ): Promise<BillingCheckoutResponse> => {
      const res = await this.http.post<BillingCheckoutResponse>(
        '/billing/checkout-session',
        data,
      );
      return res.data;
    },

    portal: async (): Promise<BillingPortalResponse> => {
      const res = await this.http.post<BillingPortalResponse>(
        '/billing/portal-session',
      );
      return res.data;
    },
  };

  admin = {
    users: async (): Promise<AdminUsersResponse> => {
      const res = await this.http.get<AdminUsersResponse>('/admin/users');
      return res.data;
    },

    metrics: async (): Promise<AdminMetricsResponse> => {
      const res = await this.http.get<AdminMetricsResponse>('/admin/metrics');
      return res.data;
    },
  };

  adminConsole = {
    jobs: async (
      params: AdminConsoleJobsRequest = {},
    ): Promise<AdminConsoleJobsResponse> => {
      const res = await this.http.get<AdminConsoleJobsResponse>(
        '/admin/console/jobs',
        { params },
      );
      return res.data;
    },

    job: async (jobId: string): Promise<AdminConsoleJobDetail> => {
      const res = await this.http.get<AdminConsoleJobDetail>(
        `/admin/console/jobs/${encodeURIComponent(jobId)}`,
      );
      return res.data;
    },

    resumeFailures: async (
      params: AdminConsoleResumeFailuresRequest = {},
    ): Promise<AdminConsoleResumeFailuresResponse> => {
      const res = await this.http.get<AdminConsoleResumeFailuresResponse>(
        '/admin/console/resume-failures',
        { params },
      );
      return res.data;
    },

    resumeFailure: async (
      resumeId: string,
    ): Promise<AdminConsoleResumeFailure> => {
      const res = await this.http.get<AdminConsoleResumeFailure>(
        `/admin/console/resume-failures/${encodeURIComponent(resumeId)}`,
      );
      return res.data;
    },

    betaGate: async (): Promise<AdminConsoleBetaGateResponse> => {
      const res = await this.http.get<AdminConsoleBetaGateResponse>(
        '/admin/console/beta',
      );
      return res.data;
    },

    notifications: async (
      params: AdminConsoleNotificationsRequest = {},
    ): Promise<AdminConsoleNotificationsResponse> => {
      const res = await this.http.get<AdminConsoleNotificationsResponse>(
        '/admin/console/notifications',
        { params },
      );
      return res.data;
    },

    applications: async (
      params: AdminConsoleApplicationsRequest = {},
    ): Promise<AdminConsoleApplicationsResponse> => {
      const res = await this.http.get<AdminConsoleApplicationsResponse>(
        '/admin/console/applications',
        { params },
      );
      return res.data;
    },

    overview: async (): Promise<AdminConsoleOverviewResponse> => {
      const res = await this.http.get<AdminConsoleOverviewResponse>(
        '/admin/console/overview',
      );
      return res.data;
    },

    activityLogs: async (
      params: AdminConsoleActivityLogsRequest = {},
    ): Promise<AdminConsoleActivityLogsResponse> => {
      const res = await this.http.get<AdminConsoleActivityLogsResponse>(
        '/admin/console/activity-logs',
        { params },
      );
      return res.data;
    },

    sessions: async (
      params: AdminConsoleSessionsRequest = {},
    ): Promise<AdminConsoleSessionsResponse> => {
      const res = await this.http.get<AdminConsoleSessionsResponse>(
        '/admin/console/sessions',
        { params },
      );
      return res.data;
    },

    users: async (
      params: AdminConsoleUsersRequest = {},
    ): Promise<AdminConsoleUsersResponse> => {
      const res = await this.http.get<AdminConsoleUsersResponse>(
        '/admin/console/users',
        { params },
      );
      return res.data;
    },

    user: async (userId: string): Promise<AdminConsoleUserDetail> => {
      const res = await this.http.get<AdminConsoleUserDetail>(
        `/admin/console/users/${encodeURIComponent(userId)}`,
      );
      return res.data;
    },

    userSessions: async (
      userId: string,
      params: AdminConsoleUserSessionsRequest = {},
    ): Promise<AdminConsoleUserSessionsResponse> => {
      const res = await this.http.get<AdminConsoleUserSessionsResponse>(
        `/admin/console/users/${encodeURIComponent(userId)}/sessions`,
        { params },
      );
      return res.data;
    },

    userUsageLimits: async (
      userId: string,
    ): Promise<AdminConsoleUserUsageLimitsResponse> => {
      const res = await this.http.get<AdminConsoleUserUsageLimitsResponse>(
        `/admin/console/users/${encodeURIComponent(userId)}/usage-limits`,
      );
      return res.data;
    },

    issueStepUp: async (
      data: AdminConsoleStepUpRequest,
    ): Promise<AdminConsoleStepUpResponse> => {
      const res = await this.http.post<AdminConsoleStepUpResponse>(
        '/admin/console/step-up',
        data,
      );
      return res.data;
    },

    suspendUser: async (
      userId: string,
      data: AdminConsoleSuspendUserRequest,
    ): Promise<AdminConsoleUserMutationResponse> => {
      const { stepUpProof, ...payload } = data;
      const res = await this.http.post<AdminConsoleUserMutationResponse>(
        `/admin/console/users/${encodeURIComponent(userId)}/suspend`,
        payload,
        { headers: { 'X-Admin-Step-Up-Proof': stepUpProof } },
      );
      return res.data;
    },

    reactivateUser: async (
      userId: string,
      data: AdminConsoleReactivateUserRequest,
    ): Promise<AdminConsoleUserMutationResponse> => {
      const res = await this.http.post<AdminConsoleUserMutationResponse>(
        `/admin/console/users/${encodeURIComponent(userId)}/reactivate`,
        undefined,
        { headers: { 'X-Admin-Step-Up-Proof': data.stepUpProof } },
      );
      return res.data;
    },

    revokeUserSession: async (
      userId: string,
      sessionId: string,
      data: AdminConsoleRevokeUserSessionRequest,
    ): Promise<AdminConsoleRevokeUserSessionResponse> => {
      const res = await this.http.post<AdminConsoleRevokeUserSessionResponse>(
        `/admin/console/users/${encodeURIComponent(userId)}/sessions/${encodeURIComponent(sessionId)}/revoke`,
        undefined,
        { headers: { 'X-Admin-Step-Up-Proof': data.stepUpProof } },
      );
      return res.data;
    },

    revokeUserSessions: async (
      userId: string,
      data: AdminConsoleRevokeUserSessionsRequest,
    ): Promise<AdminConsoleRevokeUserSessionsResponse> => {
      const res = await this.http.post<AdminConsoleRevokeUserSessionsResponse>(
        `/admin/console/users/${encodeURIComponent(userId)}/sessions/revoke-all`,
        undefined,
        { headers: { 'X-Admin-Step-Up-Proof': data.stepUpProof } },
      );
      return res.data;
    },
  };
}
