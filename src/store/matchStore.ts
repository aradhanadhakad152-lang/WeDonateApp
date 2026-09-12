import { create } from 'zustand';
import {
  DonorMatch,
  getNearbyMatches,
  triggerMatchAssignment,
  acceptMatch,
  rejectMatch,
  getMatchDetails,
  getMyMatches,
  respondToMatch,
} from '../services/matchService';

interface MatchStoreState {
  matches: DonorMatch[];
  myMatches: DonorMatch[];
  activeMatch: DonorMatch | null;
  isLoading: boolean;
  isMatching: boolean;
  error: string | null;

  // Actions
  fetchMatchesForRequest: (requestId: string) => Promise<DonorMatch[]>;
  fetchMyDonorMatches: (status?: string) => Promise<DonorMatch[]>;
  runMatchingEngine: (requestId: string, radiusKm?: number) => Promise<number>;
  acceptDonorMatch: (matchId: string) => Promise<DonorMatch>;
  rejectDonorMatch: (matchId: string, reason?: string) => Promise<DonorMatch>;
  respondToDonorMatch: (
    matchId: string,
    action: 'ACCEPTED' | 'REJECTED' | 'I_CAN_DONATE' | 'NOT_AVAILABLE',
    reason?: string
  ) => Promise<DonorMatch>;
  fetchMatchById: (matchId: string) => Promise<DonorMatch | null>;
  clearMatches: () => void;
}

export const useMatchStore = create<MatchStoreState>((set, get) => ({
  matches: [],
  myMatches: [],
  activeMatch: null,
  isLoading: false,
  isMatching: false,
  error: null,

  fetchMatchesForRequest: async (requestId: string) => {
    set({ isLoading: true, error: null });
    try {
      const data = await getNearbyMatches(requestId);
      set({ matches: data, isLoading: false });
      return data;
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to fetch matches for request';
      set({ error: msg, isLoading: false });
      return [];
    }
  },

  fetchMyDonorMatches: async (status?: string) => {
    set({ isLoading: true, error: null });
    try {
      const data = await getMyMatches(status);
      set({ myMatches: data, isLoading: false });
      return data;
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to fetch donor matches';
      set({ error: msg, isLoading: false });
      return [];
    }
  },

  runMatchingEngine: async (requestId: string, radiusKm) => {
    set({ isMatching: true, error: null });
    try {
      const result = await triggerMatchAssignment(requestId, radiusKm);
      set({ matches: result.matches, isMatching: false });
      return result.newCount;
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to run donor matching engine';
      set({ error: msg, isMatching: false });
      throw err;
    }
  },

  acceptDonorMatch: async (matchId: string) => {
    try {
      const updated = await acceptMatch(matchId);
      set((state) => ({
        activeMatch: updated,
        matches: state.matches.map((m) => (m.id === matchId || (m as any)._id === matchId ? updated : m)),
        myMatches: state.myMatches.map((m) => (m.id === matchId || (m as any)._id === matchId ? updated : m)),
      }));
      return updated;
    } catch (err: any) {
      console.error('Failed to accept donor match:', err);
      throw err;
    }
  },

  rejectDonorMatch: async (matchId: string, reason) => {
    try {
      const updated = await rejectMatch(matchId, reason);
      set((state) => ({
        activeMatch: updated,
        matches: state.matches.map((m) => (m.id === matchId || (m as any)._id === matchId ? updated : m)),
        myMatches: state.myMatches.map((m) => (m.id === matchId || (m as any)._id === matchId ? updated : m)),
      }));
      return updated;
    } catch (err: any) {
      console.error('Failed to reject donor match:', err);
      throw err;
    }
  },

  respondToDonorMatch: async (matchId, action, reason) => {
    try {
      const updated = await respondToMatch(matchId, action, reason);
      set((state) => ({
        activeMatch: updated,
        matches: state.matches.map((m) => (m.id === matchId || (m as any)._id === matchId ? updated : m)),
        myMatches: state.myMatches.map((m) => (m.id === matchId || (m as any)._id === matchId ? updated : m)),
      }));
      return updated;
    } catch (err: any) {
      console.error(`Failed to respond to donor match (${action}):`, err);
      throw err;
    }
  },

  fetchMatchById: async (matchId: string) => {
    set({ isLoading: true, error: null });
    try {
      const match = await getMatchDetails(matchId);
      set({ activeMatch: match, isLoading: false });
      return match;
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to fetch match details';
      set({ error: msg, isLoading: false });
      return null;
    }
  },

  clearMatches: () => set({ matches: [], myMatches: [], activeMatch: null, error: null }),
}));
