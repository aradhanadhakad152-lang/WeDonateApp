import * as SecureStore from 'expo-secure-store';

/**
 * Secure Token Storage Wrapper using expo-secure-store.
 *
 * SECURITY:
 * Access Tokens and Refresh Tokens MUST be stored securely using hardware-backed
 * encrypted storage (Keychain on iOS, Keystore/EncryptedSharedPreferences on Android).
 *
 * DO NOT store tokens in AsyncStorage, Zustand, or plaintext files.
 */

const ACCESS_TOKEN_KEY = 'wedonate_access_token';
const REFRESH_TOKEN_KEY = 'wedonate_refresh_token';

/**
 * Saves both Access and Refresh Tokens securely.
 * @param accessToken
 * @param refreshToken
 */
export const saveTokens = async (accessToken: string, refreshToken: string): Promise<void> => {
  try {
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
  } catch (error) {
    console.error('Failed to save authentication tokens to SecureStore:', error);
    throw error;
  }
};

/**
 * Retrieves the stored Access Token.
 */
export const getAccessToken = async (): Promise<string | null> => {
  try {
    return await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  } catch (error) {
    console.error('Failed to read Access Token from SecureStore:', error);
    return null;
  }
};

/**
 * Retrieves the stored Refresh Token.
 */
export const getRefreshToken = async (): Promise<string | null> => {
  try {
    return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  } catch (error) {
    console.error('Failed to read Refresh Token from SecureStore:', error);
    return null;
  }
};

/**
 * Clears stored Access and Refresh Tokens on logout.
 */
export const clearTokens = async (): Promise<void> => {
  try {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  } catch (error) {
    console.error('Failed to clear tokens from SecureStore:', error);
  }
};
