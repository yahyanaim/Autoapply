import { API_BASE_URL } from '../../shared/config';

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
}

export class AuthManager {
  private refreshPromise: Promise<string | null> | null = null;
  private isLoggingOut = false;

  async getToken(): Promise<string | null> {
    const items = await chrome.storage.session.get('authToken');
    return typeof items.authToken === 'string' ? items.authToken : null;
  }

  async getRefreshToken(): Promise<string | null> {
    const items = await chrome.storage.local.get('refreshToken');
    return typeof items.refreshToken === 'string' ? items.refreshToken : null;
  }

  async setTokens(tokens: AuthResponse): Promise<void> {
    await Promise.all([
      chrome.storage.session.set({ authToken: tokens.accessToken }),
      chrome.storage.local.set({ refreshToken: tokens.refreshToken }),
    ]);
  }

  async clearTokens(): Promise<void> {
    await Promise.all([
      chrome.storage.session.remove('authToken'),
      chrome.storage.local.remove('refreshToken'),
    ]);
  }

  async exchangeHandoff(code: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/auth/extension/exchange`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ApplyAI-Client': 'extension',
      },
      body: JSON.stringify({ code }),
    });

    if (!response.ok) {
      throw new Error(
        await this.getErrorMessage(response, 'Extension connection failed'),
      );
    }

    await this.setTokens((await response.json()) as AuthResponse);
  }

  async refreshToken(): Promise<string | null> {
    if (this.isLoggingOut) return null;
    if (!this.refreshPromise) {
      this.refreshPromise = this.performRefresh().finally(() => {
        this.refreshPromise = null;
      });
    }
    return this.refreshPromise;
  }

  private async performRefresh(): Promise<string | null> {
    const refreshToken = await this.getRefreshToken();
    if (!refreshToken) return null;

    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-ApplyAI-Client': 'extension',
        },
        body: JSON.stringify({ refreshToken }),
      });

      if (response.ok) {
        const tokens = (await response.json()) as AuthResponse;
        await this.setTokens(tokens);
        return tokens.accessToken;
      }

      if (await this.getRefreshToken() === refreshToken) {
        await this.clearTokens();
      }
      return null;
    } catch {
      return null;
    }
  }

  async logout(): Promise<void> {
    this.isLoggingOut = true;
    try {
      await this.refreshPromise?.catch(() => undefined);
      const accessToken = await this.getToken();
      const refreshToken = await this.getRefreshToken();
      if (accessToken || refreshToken) {
        await fetch(`${API_BASE_URL}/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-ApplyAI-Client': 'extension',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({ refreshToken }),
        });
      }
    } finally {
      await this.clearTokens();
      this.isLoggingOut = false;
    }
  }

  async apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
    let accessToken = await this.getToken();
    if (!accessToken) {
      accessToken = await this.refreshToken();
    }
    if (!accessToken) {
      throw new Error('Not authenticated');
    }

    const request = (token: string) => {
      const headers = new Headers(init.headers);
      if (typeof init.body === 'string' && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }
      headers.set('Authorization', `Bearer ${token}`);

      return fetch(`${API_BASE_URL}${path}`, {
        ...init,
        headers,
      });
    };

    let response = await request(accessToken);
    if (response.status === 401) {
      const refreshed = await this.refreshToken();
      if (!refreshed) return response;
      response = await request(refreshed);
    }
    return response;
  }

  async isAuthenticated(): Promise<boolean> {
    if (await this.getToken()) return true;
    return (await this.getRefreshToken()) !== null;
  }

  async configureStorageAccess(): Promise<void> {
    await Promise.all([
      chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
      chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
    ]);
  }

  private async getErrorMessage(response: Response, fallback: string): Promise<string> {
    try {
      const data = (await response.json()) as { message?: string | string[] };
      if (Array.isArray(data.message)) return data.message.join(', ');
      return data.message || fallback;
    } catch {
      return fallback;
    }
  }
}
