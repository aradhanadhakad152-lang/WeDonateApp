import { BloodGroup } from './user.types';

export type RequestStatus = 'OPEN' | 'MATCHING' | 'ACCEPTED' | 'FULFILLED' | 'CANCELLED' | 'EXPIRED';
export type UrgencyLevel = 'CRITICAL' | 'HIGH' | 'URGENT' | 'NORMAL';

export interface RequestLocation {
  type: 'Point';
  coordinates: [number, number]; // [longitude, latitude]
}

export interface BloodRequest {
  id: string;
  _id?: string;
  requesterId?: any;
  createdBy?: string;
  patientName: string;
  bloodGroup: BloodGroup;
  unitsRequired: number;
  urgency: UrgencyLevel;
  hospitalName: string;
  hospitalAddress: string;
  hospitalLatitude?: number;
  hospitalLongitude?: number;
  location: RequestLocation;
  contactPhone: string;
  requiredBy?: string;
  reason?: string;
  additionalNotes?: string;
  status: RequestStatus;
  acceptedDonorId?: string | null;
  fulfilledAt?: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
  distanceKm?: number;
  formattedDistance?: string;
  myMatchStatus?: 'PENDING' | 'ACCEPTED' | 'REJECTED' | null;
  myMatchId?: string | null;
}

export interface CreateBloodRequestPayload {
  patientName: string;
  bloodGroup: BloodGroup;
  unitsRequired: number;
  urgency?: UrgencyLevel;
  hospitalName: string;
  hospitalAddress: string;
  hospitalLatitude: number;
  hospitalLongitude: number;
  contactPhone: string;
  requiredBy?: string;
  reason?: string;
  additionalNotes?: string;
}
