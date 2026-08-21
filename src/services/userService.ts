import { api } from './api';
import { User, UpdateProfilePayload, PatchProfilePayload, UserLocation } from '../types/user.types';
import { ApiSuccessResponse } from '../types/api.types';

export interface LocationUpdatePayload {
  latitude: number;
  longitude: number;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  accuracy?: number;
}

export interface NearbyDonor {
  id: string;
  name: string;
  fullName: string;
  bloodGroup: string;
  isEligible: boolean;
  isAvailable: boolean;
  isDonor: boolean;
  donorStatus: string;
  role: string;
  isVerified: boolean;
  location: {
    city: string;
    state: string;
    coordinates: [number, number];
  };
  distanceKm: number;
  formattedDistance: string;
}

/**
 * User Service — Mobile Client API Methods
 */

export const getProfile = async (): Promise<User> => {
  try {
    const response = await api.get<ApiSuccessResponse<{ user: User }>>('/users/me');
    return response.data.data!.user;
  } catch (error) {
    console.error('Failed to fetch user profile:', error);
    throw error;
  }
};

export const updateProfile = async (payload: UpdateProfilePayload): Promise<User> => {
  try {
    const response = await api.put<ApiSuccessResponse<{ user: User }>>('/users/me', payload);
    return response.data.data!.user;
  } catch (error) {
    console.error('Failed to update user profile:', error);
    throw error;
  }
};

export const updateLocation = async (payload: LocationUpdatePayload): Promise<UserLocation> => {
  try {
    const response = await api.put<ApiSuccessResponse<{ location: UserLocation }>>('/users/me/location', payload);
    return response.data.data!.location;
  } catch (error) {
    console.error('Failed to update user location:', error);
    throw error;
  }
};

export const getNearbyDonors = async (
  latitude: number,
  longitude: number,
  radiusKm = 10,
  bloodGroup?: string
): Promise<NearbyDonor[]> => {
  try {
    const params: any = { latitude, longitude, radius: radiusKm };
    if (bloodGroup) params.bloodGroup = bloodGroup;

    const response = await api.get<ApiSuccessResponse<{ donors: NearbyDonor[] }>>('/users/nearby', { params });
    return response.data.data!.donors;
  } catch (error) {
    console.error('Failed to fetch nearby donors:', error);
    throw error;
  }
};

export const patchProfile = async (payload: PatchProfilePayload): Promise<User> => {
  try {
    const response = await api.patch<ApiSuccessResponse<{ user: User }>>('/users/me', payload);
    return response.data.data!.user;
  } catch (error) {
    console.error('Failed to patch user profile:', error);
    throw error;
  }
};

export const deleteProfile = async (): Promise<void> => {
  try {
    await api.delete('/users/me');
  } catch (error) {
    console.error('Failed to deactivate user profile:', error);
    throw error;
  }
};
