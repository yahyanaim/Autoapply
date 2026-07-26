import axios, { AxiosInstance, AxiosError } from 'axios';
import { ApiError } from './errors';
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
  JobSearchRequest,
  JobSearchResponse,
  ApplicationCreateRequest,
  ApplicationCreateResponse,
  ApplicationUpdateRequest,
  ApplicationUpdateResponse,
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
        ...(options.client === 'extension' ? { 'X-ApplyAI-Client': 'extension' } : {}),
      },
    });

    this.http.interceptors.response.use(
      (response) => response,
      (error: AxiosError<{ message?: string; code?: string }>) => {
        const status = error.response?.status ?? 500;
        const message = error.response?.data?.message ?? error.message;
        const code = error.response?.data?.code ?? 'UNKNOWN_ERROR';
        throw new ApiError(status, message, code);
      }
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

    register: async (data: AuthRegisterRequest): Promise<AuthRegisterResponse> => {
      const res = await this.http.post<AuthRegisterResponse>('/auth/register', data);
      return res.data;
    },

    refresh: async (data: AuthRefreshRequest = {}): Promise<AuthRefreshResponse> => {
      const res = await this.http.post<AuthRefreshResponse>('/auth/refresh', data);
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
    upload: async (data: ResumeUploadRequest): Promise<ResumeUploadResponse> => {
      const formData = new FormData();
      formData.append('file', data.file);
      const res = await this.http.post<ResumeUploadResponse>('/resumes', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data;
    },

    list: async (): Promise<ResumeListResponse> => {
      const res = await this.http.get<ResumeListResponse>('/resumes');
      return res.data;
    },
  };

  jobs = {
    search: async (params: JobSearchRequest): Promise<JobSearchResponse> => {
      const res = await this.http.get<JobSearchResponse>('/jobs/search', { params });
      return res.data;
    },
  };

  applications = {
    create: async (data: ApplicationCreateRequest): Promise<ApplicationCreateResponse> => {
      const res = await this.http.post<ApplicationCreateResponse>('/applications', data);
      return res.data;
    },

    update: async (
      id: string,
      data: ApplicationUpdateRequest
    ): Promise<ApplicationUpdateResponse> => {
      const res = await this.http.patch<ApplicationUpdateResponse>(`/applications/${id}`, data);
      return res.data;
    },
  };

  ai = {
    matchScore: async (data: AiMatchScoreRequest): Promise<AiMatchScoreResponse> => {
      const res = await this.http.post<AiMatchScoreResponse>('/ai/match-score', data);
      return res.data;
    },

    matchScoreText: async (data: AiMatchScoreTextRequest): Promise<AiMatchScoreResponse> => {
      const res = await this.http.post<AiMatchScoreResponse>('/ai/match-score-text', data);
      return res.data;
    },

    optimize: async (data: AiOptimizeRequest): Promise<AiOptimizeResponse> => {
      const res = await this.http.post<AiOptimizeResponse>('/ai/optimize', data);
      return res.data;
    },

    coverLetter: async (data: AiCoverLetterRequest): Promise<AiCoverLetterResponse> => {
      const res = await this.http.post<AiCoverLetterResponse>('/ai/cover-letter', data);
      return res.data;
    },
  };

  billing = {
    checkout: async (data: BillingCheckoutRequest): Promise<BillingCheckoutResponse> => {
      const res = await this.http.post<BillingCheckoutResponse>('/billing/checkout-session', data);
      return res.data;
    },

    portal: async (): Promise<BillingPortalResponse> => {
      const res = await this.http.post<BillingPortalResponse>('/billing/portal-session');
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
}
