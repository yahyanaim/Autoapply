const baseURL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');

export interface SessionUser {
  id: string;
  email: string;
  role: string;
  isEmailVerified?: boolean;
  dataProcessingConsentAt?: string | null;
  privacyPolicyVersion?: string | null;
  mfaEnabled?: boolean;
  createdAt?: string;
  profile?: {
    fullName?: string | null;
    headline?: string | null;
    location?: string | null;
  } | null;
}

export interface AuthResponse {
  accessToken: string;
  user: SessionUser;
}

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
  retryOnUnauthorized?: boolean;
}

class ApiClient {
  private token: string | null = null;
  private refreshPromise: Promise<AuthResponse> | null = null;
  private sessionExpiredHandler: (() => void) | null = null;
  private isLoggingOut = false;

  setToken(token: string | null) {
    this.token = token;
  }

  onSessionExpired(handler: () => void) {
    this.sessionExpiredHandler = handler;
  }

  private async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const { params, retryOnUnauthorized = true, ...fetchOptions } = options;
    const url = new URL(endpoint, `${baseURL}/`);

    Object.entries(params ?? {}).forEach(([key, value]) => {
      if (value !== undefined) url.searchParams.set(key, String(value));
    });

    const headers = new Headers(fetchOptions.headers);
    if (fetchOptions.body && !(fetchOptions.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    if (this.token) headers.set('Authorization', `Bearer ${this.token}`);

    const response = await fetch(url, {
      ...fetchOptions,
      credentials: 'include',
      headers,
    });

    if (
      response.status === 401 &&
      retryOnUnauthorized &&
      !this.isLoggingOut &&
      !endpoint.startsWith('/auth/')
    ) {
      try {
        await this.refresh();
        return this.request<T>(endpoint, { ...options, retryOnUnauthorized: false });
      } catch {
        this.token = null;
        this.sessionExpiredHandler?.();
        throw new Error('Your session has expired. Please sign in again.');
      }
    }

    if (!response.ok) {
      const payload = await response.json().catch(() => ({ message: `Request failed (${response.status})` }));
      const message = Array.isArray(payload.message) ? payload.message.join(', ') : payload.message;
      throw new Error(message || `Request failed (${response.status})`);
    }

    if (response.status === 204) return undefined as T;
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  async refresh(): Promise<AuthResponse> {
    if (this.isLoggingOut) throw new Error('Logout is in progress');
    if (!this.refreshPromise) {
      this.refreshPromise = this.withSessionLock(() =>
        this.request<AuthResponse>('/auth/refresh', {
          method: 'POST',
          body: '{}',
          retryOnUnauthorized: false,
        }),
      )
        .then((result) => {
          this.token = result.accessToken;
          return result;
        })
        .finally(() => {
          this.refreshPromise = null;
        });
    }
    return this.refreshPromise;
  }

  get<T>(endpoint: string, params?: RequestOptions['params']): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET', params });
  }

  post<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  put<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  patch<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  delete<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'DELETE',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  upload<T>(endpoint: string, file: File, fields: Record<string, string> = {}): Promise<T> {
    const formData = new FormData();
    formData.append('file', file);
    Object.entries(fields).forEach(([key, value]) => formData.append(key, value));
    return this.request<T>(endpoint, { method: 'POST', body: formData });
  }

  login(
    email: string,
    password: string,
    mfaCode?: string,
  ): Promise<AuthResponse> {
    return this.request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, mfaCode: mfaCode || undefined }),
      retryOnUnauthorized: false,
    }).then((result) => {
      this.token = result.accessToken;
      return result;
    });
  }

  register(
    fullName: string,
    email: string,
    password: string,
    acceptDataProcessing: boolean,
  ): Promise<AuthResponse> {
    return this.request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ fullName, email, password, acceptDataProcessing }),
      retryOnUnauthorized: false,
    }).then((result) => {
      this.token = result.accessToken;
      return result;
    });
  }

  async logout(): Promise<void> {
    this.isLoggingOut = true;
    try {
      await this.refreshPromise?.catch(() => undefined);
      await this.withSessionLock(() =>
        this.request('/auth/logout', { method: 'POST', retryOnUnauthorized: false }),
      );
    } finally {
      this.token = null;
      this.isLoggingOut = false;
    }
  }

  private async withSessionLock<T>(action: () => Promise<T>): Promise<T> {
    if (typeof navigator !== 'undefined' && navigator.locks) {
      return await navigator.locks.request('applyai-refresh-session', action);
    }
    return action();
  }
}

export const apiBaseURL = baseURL;
export const apiClient = new ApiClient();
