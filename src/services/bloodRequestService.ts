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

export const getBloodRequests = async (params?: {
  status?: string;
  bloodGroup?: string;
  urgency?: string;
}): Promise<BloodRequest[]> => {
  try {
    const response = await api.get<ApiSuccessResponse<{ requests: BloodRequest[] }>>('/blood-requests', { params });
    return response.data.data!.requests;
  } catch (error) {
    console.error('Failed to fetch blood requests:', error);
    throw error;
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
