import { api } from './api';
import { ApiSuccessResponse } from '../types/api.types';

export interface HospitalSuggestion {
  placeId: string;
  name: string;
  address: string;
  fullText: string;
}

export interface RealHospital {
  id: string;
  placeId?: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
  formattedDistance: string;
  phone?: string | null;
  rating?: number | null;
  isOpenNow?: boolean | null;
}

/**
 * Calculates Haversine distance in kilometers between two GPS coordinates.
 */
export const calculateHaversineDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Fetches Google Places (New) autocomplete suggestions via backend proxy.
 */
export const getHospitalAutocomplete = async (
  input: string,
  latitude?: number,
  longitude?: number
): Promise<{ suggestions: HospitalSuggestion[]; attribution: string }> => {
  try {
    const response = await api.get<ApiSuccessResponse<{ suggestions: HospitalSuggestion[]; attribution: string }>>(
      '/hospitals/autocomplete',
      { params: { input, latitude, longitude } }
    );
    return response.data.data!;
  } catch (error) {
    console.error('Failed to autocomplete hospitals:', error);
    return { suggestions: [], attribution: 'Powered by Google' };
  }
};

/**
 * Fetches real nearby hospitals via backend Google Places API proxy based on user's GPS coordinates.
 */
export const getNearbyHospitals = async (
  latitude: number,
  longitude: number,
  radiusKm = 10
): Promise<RealHospital[]> => {
  try {
    const response = await api.get<ApiSuccessResponse<{ hospitals: RealHospital[]; attribution: string }>>(
      '/hospitals/nearby',
      { params: { latitude, longitude, radius: radiusKm } }
    );
    return response.data.data!.hospitals;
  } catch (error) {
    console.error('Failed to fetch nearby hospitals:', error);
    return [];
  }
};

/**
 * Fetches real nearby blood banks via backend Google Places API proxy based on user's GPS coordinates.
 */
export const getNearbyBloodBanks = async (
  latitude: number,
  longitude: number,
  radiusKm = 10
): Promise<RealHospital[]> => {
  try {
    const response = await api.get<ApiSuccessResponse<{ hospitals: RealHospital[]; attribution: string }>>(
      '/hospitals/blood-banks',
      { params: { latitude, longitude, radius: radiusKm } }
    );
    return response.data.data!.hospitals;
  } catch (error) {
    console.error('Failed to fetch nearby blood banks:', error);
    return [];
  }
};
