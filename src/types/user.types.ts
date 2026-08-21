export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-', 'O+' | 'O-';
export type UserRole = 'CITIZEN' | 'HOSPITAL_STAFF' | 'ADMIN';
export type AccountStatus = 'ACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION';
export type DonorStatus = 'AVAILABLE' | 'UNAVAILABLE' | 'INELIGIBLE';
export type Gender = 'MALE' | 'FEMALE' | 'OTHER';

export interface UserLocation {
  type: 'Point';
  coordinates: [number, number]; // [longitude, latitude]
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  accuracy?: number | null;
  updatedAt?: string | null;
}

export interface User {
  id: string;
  firebaseUid: string;
  phone: string;
  name?: string;
  fullName?: string;
  email?: string;
  profilePhoto?: string;
  gender?: Gender;
  age?: number;
  dateOfBirth?: string;
  bloodGroup?: BloodGroup;
  isDonor?: boolean;
  donorStatus?: DonorStatus;
  lastDonationDate?: string;
  nextEligibleDonationDate?: string;
  isEligible?: boolean;
  isAvailable?: boolean;
  location?: UserLocation;
  role: UserRole;
  isActive?: boolean;
  accountStatus: AccountStatus;
  isVerified: boolean;
  isProfileComplete?: boolean;
  lastLogin?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateProfilePayload {
  name?: string;
  fullName?: string;
  email?: string;
  profilePhoto?: string;
  gender?: Gender;
  age?: number;
  dateOfBirth?: string;
  bloodGroup?: BloodGroup;
  isDonor?: boolean;
  donorStatus?: DonorStatus;
  lastDonationDate?: string;
  location?: {
    latitude?: number;
    longitude?: number;
    coordinates?: [number, number];
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
    accuracy?: number;
  };
  deviceToken?: string;
}

export interface PatchProfilePayload {
  isAvailable?: boolean;
  donorStatus?: DonorStatus;
  deviceToken?: string;
}
