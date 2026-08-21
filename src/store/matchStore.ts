import { create } from 'zustand';
import {
  DonorMatch,
  getNearbyMatches,
  triggerMatchAssignment,
  acceptMatch,
  rejectMatch,
  getMatchDetails,
} from '../services/matchService';

interface MatchStoreState {
  matches: DonorMatch[];
  activeMatch: DonorMatch | null;
  isLoading: boolean;
  isMatching: boolean;
  error: string | null;

  // Actions
  fetchMatchesForRequest: (requestId: string) => Promise<DonorMatch[]>;
  runMatchingEngine: (requestId: string, radiusKm?: number) => Promise<number>;
  acceptDonorMatch: (matchId: string) => Promise<DonorMatch>;
  rejectDonorMatch: (matchId: string, reason?: string) => Promise<DonorMatch>;
  fetchMatchById: (matchId: string) => Promise<DonorMatch | null>;
  clearMatches: () => void;
}

export const useMatchStore = create<MatchStoreState>((set, get) => ({
  matches: [],
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
        matches: state.matches.map((m) => (m.id === matchId ? updated : m)),
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
        matches: state.matches.map((m) => (m.id === matchId ? updated : m)),
      }));
      return updated;
    } catch (err: any) {
      console.error('Failed to reject donor match:', err);
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

  clearMatches: () => set({ matches: [], activeMatch: null, error: null }),
}));
