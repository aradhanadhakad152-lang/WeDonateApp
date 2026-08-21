import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import { api } from './api';
import { saveTokens, clearTokens, getRefreshToken } from '../utils/tokenStorage';
import { User } from '../types/user.types';
import { LoginResponse } from '../types/api.types';

/**
 * Client Authentication Service
 *
 * Implements real Firebase Phone Authentication (SMS OTP) + backend handshake.
 *
 * Flow:
 * 1. Mobile app requests real SMS OTP via `@react-native-firebase/auth`.
 * 2. User submits 6-digit SMS code.
 * 3. Firebase SDK returns Firebase User & ID Token.
 * 4. App sends ID Token to backend `POST /api/v1/auth/firebase-login`.
 * 5. Backend verifies ID token, upserts User in MongoDB Atlas, returns JWT pair.
 * 6. App saves Access Token & Refresh Token in `expo-secure-store`.
 */

export const requestSMSOTP = async (phoneNumber: string): Promise<FirebaseAuthTypes.ConfirmationResult> => {
  try {
    // Send real SMS OTP via native cellular network
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
    // 1. Confirm SMS OTP with Firebase
    const credential = await confirmation.confirm(otpCode);
    if (!credential || !credential.user) {
      throw new Error('Firebase OTP confirmation returned no user credential');
    }

    // 2. Get Firebase ID Token
    const idToken = await credential.user.getIdToken(/* forceRefresh */ true);

    // 3. Send Firebase ID Token to backend API
    const response = await api.post<LoginResponse>('/auth/firebase-login', { deviceToken }, {
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    });

    const { user, tokens } = response.data.data;

    // 4. Save Access Token & Refresh Token securely in expo-secure-store
    await saveTokens(tokens.accessToken, tokens.refreshToken);

    return user;
  } catch (error) {
    console.error('OTP Verification & Backend Login failed:', error);
    throw error;
  }
};

export const logoutUser = async (): Promise<void> => {
  try {
    const refreshToken = await getRefreshToken();
    if (refreshToken) {
      await api.post('/auth/logout', { refreshToken });
    }
  } catch (error) {
    console.warn('Backend logout call failed or network unreachable:', error);
  } finally {
    await clearTokens();
    await auth().signOut();
  }
};
