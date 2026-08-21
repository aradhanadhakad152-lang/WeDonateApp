import { create } from 'zustand';
import { User, UpdateProfilePayload } from '../types/user.types';
import { getProfile, updateProfile, patchProfile } from '../services/userService';
import { getCurrentDeviceLocation, LocationData } from '../services/locationService';

interface UserStoreState {
  profile: User | null;
  isLoading: boolean;
  isUpdating: boolean;
  error: string | null;
  deviceLocation: LocationData | null;

  // Actions
  fetchProfile: () => Promise<User | null>;
  updateUserProfile: (payload: UpdateProfilePayload) => Promise<User>;
  toggleAvailability: (isAvailable: boolean) => Promise<void>;
  acquireLocation: () => Promise<LocationData | null>;
  clearProfile: () => void;
}

export const useUserStore = create<UserStoreState>((set, get) => ({
  profile: null,
  isLoading: false,
  isUpdating: false,
  error: null,
  deviceLocation: null,

  fetchProfile: async () => {
    set({ isLoading: true, error: null });
    try {
      const user = await getProfile();
      set({ profile: user, isLoading: false });
      return user;
    } catch (err: any) {
      const errorMsg = err?.response?.data?.message || 'Failed to fetch user profile';
      set({ error: errorMsg, isLoading: false });
      return null;
    }
  },

  updateUserProfile: async (payload: UpdateProfilePayload) => {
    set({ isUpdating: true, error: null });
    try {
      const updatedUser = await updateProfile(payload);
      set({ profile: updatedUser, isUpdating: false });
      return updatedUser;
    } catch (err: any) {
      const errorMsg = err?.response?.data?.message || 'Failed to update user profile';
      set({ error: errorMsg, isUpdating: false });
      throw err;
    }
  },

  toggleAvailability: async (isAvailable: boolean) => {
    const currentProfile = get().profile;
    if (!currentProfile) return;

    // Optimistic UI update
    set({
      profile: {
        ...currentProfile,
        isAvailable,
        donorStatus: isAvailable ? 'AVAILABLE' : 'UNAVAILABLE',
      },
    });

    try {
      const updatedUser = await patchProfile({ isAvailable, donorStatus: isAvailable ? 'AVAILABLE' : 'UNAVAILABLE' });
      set({ profile: updatedUser });
    } catch (err: any) {
      // Rollback on failure
      set({ profile: currentProfile });
      console.error('Failed to toggle donor availability:', err);
    }
  },

  acquireLocation: async () => {
    const location = await getCurrentDeviceLocation();
    if (location) {
      set({ deviceLocation: location });
    }
    return location;
  },

  clearProfile: () => {
    set({
      profile: null,
      isLoading: false,
      isUpdating: false,
      error: null,
      deviceLocation: null,
    });
  },
}));
