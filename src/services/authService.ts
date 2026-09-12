import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import { api } from './api';
import { saveTokens, clearTokens, getRefreshToken } from '../utils/tokenStorage';
import { User } from '../types/user.types';
import { ApiSuccessResponse, LoginResponse } from '../types/api.types';
import { initializeNotifications } from './notificationService';

/**
 * Client Authentication Service
 *
 * Development Direct Login
 * AND
 * Production Firebase Phone Authentication (SMS OTP)
 */

// ============================================================================
// DEVELOPMENT AUTHENTICATION
// ============================================================================

export const devLogin = async (
  phone: string,
  fullName?: string,
  email?: string
): Promise<User> => {
  try {
    const response = await api.post<ApiSuccessResponse<LoginResponse>>(
      '/auth/dev-login',
      {
        phone,
        fullName,
        email,
      }
    );

    const { user, tokens } = response.data.data!;

    // Save JWT access + refresh tokens
    await saveTokens(tokens.accessToken, tokens.refreshToken);

    // Initialize FCM after successful backend login
    try {
      await initializeNotifications();
    } catch (notificationError) {
      console.warn(
        'FCM initialization failed, login will continue:',
        notificationError
      );
    }

    return user;
  } catch (error) {
    console.error('Dev Login failed:', error);
    throw error;
  }
};

// ============================================================================
// PRODUCTION FIREBASE PHONE AUTHENTICATION
// ============================================================================

export const requestSMSOTP = async (
  phoneNumber: string
): Promise<FirebaseAuthTypes.ConfirmationResult> => {
  try {
    const confirmation = await auth().signInWithPhoneNumber(phoneNumber);
    return confirmation;
  } catch (error) {
    console.error('Firebase Phone Auth request failed:', error);
    throw error;
  }
};

export const verifyOTPAndLogin = async (
  confirmation: FirebaseAuthTypes.ConfirmationResult,
  otpCode: string,
  deviceToken?: string
): Promise<User> => {
  try {
    // 1. Confirm SMS OTP
    const credential = await confirmation.confirm(otpCode);

    if (!credential || !credential.user) {
      throw new Error(
        'Firebase OTP confirmation returned no user credential'
      );
    }

    // 2. Get Firebase ID Token
    const idToken = await credential.user.getIdToken(true);

    // 3. Login to WE DONATE backend
    const response = await api.post<ApiSuccessResponse<LoginResponse>>(
      '/auth/firebase-login',
      { deviceToken },
      {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      }
    );

    const { user, tokens } = response.data.data!;

    // 4. Save backend JWT tokens
    await saveTokens(tokens.accessToken, tokens.refreshToken);

    // 5. Initialize FCM
    try {
      await initializeNotifications();
    } catch (notificationError) {
      console.warn(
        'FCM initialization failed, login will continue:',
        notificationError
      );
    }

    return user;
  } catch (error) {
    console.error(
      'OTP Verification & Backend Login failed:',
      error
    );
    throw error;
  }
};

// ============================================================================
// LOGOUT
// ============================================================================

export const logoutUser = async (): Promise<void> => {
  try {
    const refreshToken = await getRefreshToken();

    if (refreshToken) {
      await api.post('/auth/logout', {
        refreshToken,
      });
    }
  } catch (error) {
    console.warn(
      'Backend logout call failed or network unreachable:',
      error
    );
  } finally {
    await clearTokens();

    try {
      if (auth().currentUser) {
        await auth().signOut();
      }
    } catch {
      // Ignore if Firebase auth is not active in dev mode
    }
  }
};