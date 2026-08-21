import { create } from 'zustand';
import { User } from '../types/user.types';
import { clearTokens } from '../utils/tokenStorage';

/**
 * Zustand Auth State Store
 *
 * Manages client UI authentication state (current user, authenticated status, loading).
 *
 * SECURITY RULE:
 * DO NOT store raw JWT Access Tokens or Refresh Tokens in this state store.
 * Tokens MUST remain securely stored in expo-secure-store ONLY.
 */

interface AuthStoreState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setLoading: (isLoading: boolean) => void;
  clearAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthStoreState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  setUser: (user: User | null) =>
    set({
      user,
      isAuthenticated: !!user,
      isLoading: false,
    }),

  setLoading: (isLoading: boolean) =>
    set({ isLoading }),

  clearAuth: async () => {
    await clearTokens();
    set({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });
  },
}));
