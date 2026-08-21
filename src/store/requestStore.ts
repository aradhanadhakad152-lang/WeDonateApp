import { create } from 'zustand';
import { BloodRequest } from '../types/request.types';
import {
  createBloodRequest,
  getBloodRequests,
  getMyBloodRequests,
  getBloodRequestById,
  cancelBloodRequest,
  CreateRequestPayload,
} from '../services/bloodRequestService';

interface RequestStoreState {
  requests: BloodRequest[];
  myRequests: BloodRequest[];
  selectedRequest: BloodRequest | null;
  isLoading: boolean;
  isCreating: boolean;
  error: string | null;

  // Actions
  fetchRequests: (params?: { status?: string; bloodGroup?: string; urgency?: string }) => Promise<BloodRequest[]>;
  fetchMyRequests: () => Promise<BloodRequest[]>;
  fetchRequestById: (id: string) => Promise<BloodRequest | null>;
  submitNewRequest: (payload: CreateRequestPayload) => Promise<BloodRequest>;
  cancelUserRequest: (id: string) => Promise<BloodRequest>;
  clearSelectedRequest: () => void;
}

export const useRequestStore = create<RequestStoreState>((set, get) => ({
  requests: [],
  myRequests: [],
  selectedRequest: null,
  isLoading: false,
  isCreating: false,
  error: null,

  fetchRequests: async (params) => {
    set({ isLoading: true, error: null });
    try {
      const data = await getBloodRequests(params);
      set({ requests: data, isLoading: false });
      return data;
    } catch (err: any) {
      const errorMsg = err?.response?.data?.message || 'Failed to fetch blood requests';
      set({ error: errorMsg, isLoading: false });
      return [];
    }
  },

  fetchMyRequests: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await getMyBloodRequests();
      set({ myRequests: data, isLoading: false });
      return data;
    } catch (err: any) {
      const errorMsg = err?.response?.data?.message || 'Failed to fetch your blood requests';
      set({ error: errorMsg, isLoading: false });
      return [];
    }
  },

  fetchRequestById: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const request = await getBloodRequestById(id);
      set({ selectedRequest: request, isLoading: false });
      return request;
    } catch (err: any) {
      const errorMsg = err?.response?.data?.message || 'Failed to fetch request details';
      set({ error: errorMsg, isLoading: false });
      return null;
    }
  },

  submitNewRequest: async (payload: CreateRequestPayload) => {
    set({ isCreating: true, error: null });
    try {
      const newRequest = await createBloodRequest(payload);
      set((state) => ({
        myRequests: [newRequest, ...state.myRequests],
        requests: [newRequest, ...state.requests],
        selectedRequest: newRequest,
        isCreating: false,
      }));
      return newRequest;
    } catch (err: any) {
      const errorMsg = err?.response?.data?.message || 'Failed to create emergency blood request';
      set({ error: errorMsg, isCreating: false });
      throw err;
    }
  },

  cancelUserRequest: async (id: string) => {
    try {
      const cancelledReq = await cancelBloodRequest(id);
      set((state) => ({
        myRequests: state.myRequests.map((r) => (r.id === id ? cancelledReq : r)),
        requests: state.requests.map((r) => (r.id === id ? cancelledReq : r)),
        selectedRequest: state.selectedRequest?.id === id ? cancelledReq : state.selectedRequest,
      }));
      return cancelledReq;
    } catch (err: any) {
      console.error('Failed to cancel request:', err);
      throw err;
    }
  },

  clearSelectedRequest: () => set({ selectedRequest: null }),
}));
