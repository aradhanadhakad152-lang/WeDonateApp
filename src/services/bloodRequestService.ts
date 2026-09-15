import { api } from './api';
import { BloodRequest, CreateBloodRequestPayload } from '../types/request.types';
import { ApiSuccessResponse } from '../types/api.types';

/**
 * Blood Request Service — Mobile Client API Methods
 */

export interface CreateRequestPayload {
  patientName: string;
  bloodGroup: string;
  unitsRequired: number;
  hospitalName: string;
  hospitalAddress: string;
  hospitalLatitude: number;
  hospitalLongitude: number;
  urgency?: 'CRITICAL' | 'URGENT' | 'NORMAL';
  requiredBy?: string;
  reason?: string;
  contactPhone: string;
  additionalNotes?: string;
}

export const createBloodRequest = async (payload: CreateRequestPayload): Promise<BloodRequest> => {
  try {
    const response = await api.post<ApiSuccessResponse<{ request: BloodRequest }>>('/blood-requests', payload);
    return response.data.data!.request;
  } catch (error) {
    console.error('Failed to create blood request:', error);
    throw error;
  }
};

export interface FetchRequestsParams {
  page?: number;
  limit?: number;
  mode?: 'ALL' | 'NEARBY' | 'MATCHING' | 'URGENT' | 'MY_REQUESTS';
  status?: string;
  bloodGroup?: string;
  urgency?: string;
  latitude?: number;
  longitude?: number;
  radius?: number;
  dateRange?: string;
  sort?: 'newest' | 'nearest' | 'urgency' | 'expiring';
}

export interface FetchRequestsResponse {
  requests: BloodRequest[];
  total: number;
  page: number;
  totalPages: number;
  hasMore: boolean;
}

export const getBloodRequests = async (params?: FetchRequestsParams): Promise<BloodRequest[]> => {
  try {
    const response = await api.get<ApiSuccessResponse<{ requests: BloodRequest[]; total?: number }>>('/blood-requests', { params });
    return response.data.data!.requests;
  } catch (error) {
    console.error('Failed to fetch blood requests:', error);
    throw error;
  }
};

export const getBloodRequestsWithMeta = async (params?: FetchRequestsParams): Promise<FetchRequestsResponse> => {
  try {
    const response = await api.get<ApiSuccessResponse<FetchRequestsResponse>>('/blood-requests', { params });
    const data = response.data.data!;
    return {
      requests: data.requests || [],
      total: data.total || 0,
      page: data.page || 1,
      totalPages: data.totalPages || 1,
      hasMore: !!data.hasMore,
    };
  } catch (error) {
    console.error('Failed to fetch blood requests feed:', error);
    return { requests: [], total: 0, page: 1, totalPages: 1, hasMore: false };
  }
};

export const getMyBloodRequests = async (): Promise<BloodRequest[]> => {
  try {
    const response = await api.get<ApiSuccessResponse<{ requests: BloodRequest[] }>>('/blood-requests/my');
    return response.data.data!.requests;
  } catch (error) {
    console.error('Failed to fetch my blood requests:', error);
    throw error;
  }
};

export const getBloodRequestById = async (id: string): Promise<BloodRequest> => {
  try {
    const response = await api.get<ApiSuccessResponse<{ request: BloodRequest }>>(`/blood-requests/${id}`);
    return response.data.data!.request;
  } catch (error) {
    console.error(`Failed to fetch blood request ${id}:`, error);
    throw error;
  }
};

export const cancelBloodRequest = async (id: string): Promise<BloodRequest> => {
  try {
    const response = await api.post<ApiSuccessResponse<{ request: BloodRequest }>>(`/blood-requests/${id}/cancel`);
    return response.data.data!.request;
  } catch (error) {
    console.error(`Failed to cancel blood request ${id}:`, error);
    throw error;
  }
};

export interface FetchAvailableRequestsParams {
  radius?: number;
  radiusKm?: number;
  bloodGroup?: string;
  urgency?: string;
  latitude?: number;
  longitude?: number;
}

export const getAvailableBloodRequests = async (params?: FetchAvailableRequestsParams): Promise<BloodRequest[]> => {
  try {
    const response = await api.get<ApiSuccessResponse<{ requests: BloodRequest[]; total: number; radiusKm: number }>>('/blood-requests/available', { params });
    return response.data.data!.requests;
  } catch (error) {
    console.error('Failed to fetch available blood requests:', error);
    throw error;
  }
};

export const respondToBloodRequest = async (
  requestId: string,
  action: 'I_CAN_DONATE' | 'NOT_AVAILABLE' | 'ACCEPTED' | 'REJECTED',
  reason?: string
): Promise<{ match: any; request?: BloodRequest }> => {
  try {
    const response = await api.post<ApiSuccessResponse<{ match: any; request?: BloodRequest }>>(`/blood-requests/${requestId}/respond`, {
      action,
      response: action,
      reason,
    });
    return response.data.data!;
  } catch (error) {
    console.error(`Failed to respond to blood request ${requestId}:`, error);
    throw error;
  }
};
