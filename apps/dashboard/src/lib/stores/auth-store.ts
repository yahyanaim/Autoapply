import { create } from 'zustand';
import { apiClient, SessionUser } from '@/lib/api/api-client';

interface AuthState {
  user: SessionUser | null;
  isAuthenticated: boolean;
  isInitialized: boolean;
  isInitializing: boolean;
  initialize: () => Promise<void>;
  login: (email: string, password: string, mfaCode?: string) => Promise<void>;
  register: (
    name: string,
    email: string,
    password: string,
    acceptDataProcessing: boolean,
  ) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: SessionUser) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isInitialized: false,
  isInitializing: false,

  initialize: async () => {
    if (get().isInitialized || get().isInitializing) return;
    set({ isInitializing: true });
    try {
      const session = await apiClient.refresh();
      const user = await apiClient.get<SessionUser>('/auth/profile');
      set({ user: { ...session.user, ...user }, isAuthenticated: true });
    } catch {
      apiClient.setToken(null);
      set({ user: null, isAuthenticated: false });
    } finally {
      set({ isInitialized: true, isInitializing: false });
    }
  },

  login: async (email, password, mfaCode) => {
    const result = await apiClient.login(email, password, mfaCode);
    set({ user: result.user, isAuthenticated: true, isInitialized: true });
  },

  register: async (name, email, password, acceptDataProcessing) => {
    const result = await apiClient.register(
      name,
      email,
      password,
      acceptDataProcessing,
    );
    set({
      user: { ...result.user, profile: { fullName: name } },
      isAuthenticated: true,
      isInitialized: true,
    });
  },

  logout: async () => {
    try {
      await apiClient.logout();
    } finally {
      set({ user: null, isAuthenticated: false, isInitialized: true });
    }
  },

  setUser: (user) => set({ user, isAuthenticated: true }),
}));

apiClient.onSessionExpired(() => {
  useAuthStore.setState({ user: null, isAuthenticated: false, isInitialized: true });
});
