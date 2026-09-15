import { api } from './api';
import { ApiSuccessResponse } from '../types/api.types';

export interface DonorMatch {
  id: string;
  bloodRequest: string;
  donor: {
    id: string;
    fullName?: string;
    name?: string;
    phone?: string;
    bloodGroup?: string;
    isEligible?: boolean;
    isAvailable?: boolean;
  };
  requester: string;
  donorBloodGroup: string;
  requestedBloodGroup: string;
  distanceKm: number;
  formattedDistance: string;
  status: 'PENDING' | 'NOTIFIED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED' | 'COMPLETED';
  matchedAt: string;
  respondedAt?: string | null;
  expiresAt?: string;
  rejectionReason?: string | null;
}

export const getNearbyMatches = async (requestId: string): Promise<DonorMatch[]> => {
  try {
    const response = await api.get<ApiSuccessResponse<{ matches: DonorMatch[] }>>(`/matches/nearby/${requestId}`);
    return response.data.data!.matches;
  } catch (error) {
    console.error(`Failed to fetch matches for request ${requestId}:`, error);
    throw error;
  }
};

export const triggerMatchAssignment = async (requestId: string, radiusKm?: number): Promise<{ matches: DonorMatch[]; newCount: number }> => {
  try {
    const response = await api.post<ApiSuccessResponse<{ matches: DonorMatch[]; newCount: number }>>(`/matches/${requestId}/assign`, { radiusKm });
    return response.data.data!;
  } catch (error) {
    console.error(`Failed to assign matches for request ${requestId}:`, error);
    throw error;
  }
};

export const acceptMatch = async (matchId: string): Promise<DonorMatch> => {
  try {
    const response = await api.post<ApiSuccessResponse<{ match: DonorMatch }>>(`/matches/${matchId}/accept`);
    return response.data.data!.match;
  } catch (error) {
    console.error(`Failed to accept match ${matchId}:`, error);
    throw error;
  }
};

export const rejectMatch = async (matchId: string, reason?: string): Promise<DonorMatch> => {
  try {
    const response = await api.post<ApiSuccessResponse<{ match: DonorMatch }>>(`/matches/${matchId}/reject`, { reason });
    return response.data.data!.match;
  } catch (error) {
    console.error(`Failed to reject match ${matchId}:`, error);
    throw error;
  }
};

export const getMatchDetails = async (matchId: string): Promise<DonorMatch> => {
  try {
    const response = await api.get<ApiSuccessResponse<{ match: DonorMatch }>>(`/matches/${matchId}`);
    return response.data.data!.match;
  } catch (error) {
    console.error(`Failed to fetch details for match ${matchId}:`, error);
    throw error;
  }
};

export const getMyMatches = async (status?: string): Promise<DonorMatch[]> => {
  try {
    const response = await api.get<ApiSuccessResponse<{ matches: DonorMatch[] }>>('/matches/my', {
      params: { status: status || 'all' },
    });
    return response.data.data!.matches;
  } catch (error) {
    console.error('Failed to fetch my donor matches:', error);
    throw error;
  }
};

export const respondToMatch = async (
  matchId: string,
  responseAction: 'ACCEPTED' | 'REJECTED' | 'I_CAN_DONATE' | 'NOT_AVAILABLE',
  reason?: string
): Promise<DonorMatch> => {
  try {
    const response = await api.patch<ApiSuccessResponse<{ match: DonorMatch }>>(`/matches/${matchId}/respond`, {
      response: responseAction,
      reason,
    });
    return response.data.data!.match;
  } catch (error) {
    console.error(`Failed to respond to match ${matchId}:`, error);
    throw error;
  }
};

export const inviteDonor = async (
  donorId: string,
  requestId?: string
): Promise<{ match: DonorMatch; request: any }> => {
  try {
    const response = await api.post<ApiSuccessResponse<{ match: DonorMatch; request: any }>>('/matches/invite', {
      donorId,
      requestId,
    });
    return response.data.data!;
  } catch (error) {
    console.error(`Failed to invite donor ${donorId}:`, error);
    throw error;
  }
};
