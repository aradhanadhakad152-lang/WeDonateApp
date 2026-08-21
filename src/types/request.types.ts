// Type stubs — Milestone 1

import { BloodGroup } from './user.types';

export type RequestStatus = 'PENDING' | 'VERIFIED' | 'FULFILLED' | 'CANCELLED';
export type UrgencyLevel = 'NORMAL' | 'URGENT' | 'EMERGENCY';

export interface RequestLocation {
  type: 'Point';
  coordinates: [number, number]; // [longitude, latitude]
}

export interface BloodRequest {
  id: string;
  bloodGroup: BloodGroup;
  unitsRequired: number;
  urgency: UrgencyLevel;
  hospitalName?: string;
  location: RequestLocation;
  contactName: string;
  contactPhone: string;
  description?: string;
  status: RequestStatus;
  createdBy: string;
  verifiedBy?: string;
  verifiedAt?: string;
  fulfilledAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBloodRequestPayload {
  bloodGroup: BloodGroup;
  unitsRequired: number;
  urgency: UrgencyLevel;
  hospitalName?: string;
  latitude: number;
  longitude: number;
  contactName: string;
  contactPhone: string;
  description?: string;
}
