/**
 * appUpdateService.ts
 * ============================================================
 * Handles all app-update logic:
 *   – Fetches /api/v1/app/version from the backend
 *   – Compares installed vs latest version
 *   – Returns a structured UpdateCheckResult
 *   – Rate-limits checks (once per session + foreground resume cooldown)
 *   – Never crashes the app when the backend is unavailable
 *
 * SECURITY:
 *   – APK URL comes exclusively from the backend; the client never constructs it.
 *   – Only HTTPS APK URLs are accepted; HTTP URLs are silently rejected.
 *   – No secrets are stored or transmitted by this module.
 */

import * as Application from 'expo-application';
import { Linking } from 'react-native';
import { compareVersions, isUpdateAvailable, isMandatoryUpdate, isValidVersion } from '../utils/versionUtils';

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

export interface AppVersionResponse {
  success: boolean;
  data: {
    latestVersion: string;
    minimumVersion: string;
    android: {
      version: string;
      apkUrl?: string;
    };
    updateRequired: boolean;
    releaseNotes: string[];
  };
}

export type UpdateStatus =
  | 'no_update'      // App is up-to-date
  | 'optional'       // New version available; user can skip
  | 'mandatory';     // User must update before continuing

export interface UpdateCheckResult {
  status: UpdateStatus;
  installedVersion: string;
  latestVersion: string;
  minimumVersion: string;
  apkUrl: string | null;
  releaseNotes: string[];
  updateRequired: boolean;
}

// ──────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────

/** Backend base URL — must match api.ts */
const API_BASE_URL = 'https://wedonateapp.onrender.com';
const VERSION_ENDPOINT = `${API_BASE_URL}/api/v1/app/version`;

/**
 * Minimum milliseconds between automatic version checks.
 * Prevents hammering the API when the user rapidly backgrounds/foregrounds the app.
 */
const CHECK_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

/** Fetch timeout in milliseconds */
const FETCH_TIMEOUT_MS = 10_000;

// ──────────────────────────────────────────────────────────────
// State (module-level; reset on app restart)
// ──────────────────────────────────────────────────────────────

let lastCheckTimestamp: number | null = null;

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

/**
 * Returns the installed versionName from the Android app metadata.
 * Falls back to "0.0.0" only as a last resort; the comparison logic
 * will then correctly show an update available.
 */
const getInstalledVersion = (): string => {
  const version = Application.nativeApplicationVersion;
  if (version && isValidVersion(version)) {
    return version;
  }
  // Fallback: should never happen in a properly built APK
  console.warn('[AppUpdate] Could not read nativeApplicationVersion; using fallback.');
  return '0.0.0';
};

/**
 * Returns true if enough time has passed since the last check.
 * Always allows the very first check (lastCheckTimestamp === null).
 */
const isCooldownExpired = (): boolean => {
  if (lastCheckTimestamp === null) return true;
  return Date.now() - lastCheckTimestamp > CHECK_COOLDOWN_MS;
};

/**
 * Validates that the APK URL provided by the backend is a proper HTTPS URL.
 * Any other scheme (http, ftp, etc.) is rejected for security.
 */
const validateApkUrl = (url: unknown): string | null => {
  if (!url || typeof url !== 'string') return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') {
      console.warn(`[AppUpdate] Rejected non-HTTPS APK URL: ${url}`);
      return null;
    }
    return url;
  } catch {
    return null;
  }
};

// ──────────────────────────────────────────────────────────────
// Core API call
// ──────────────────────────────────────────────────────────────

/**
 * Fetches the version config from the backend with a timeout.
 * Returns null on any network/parse error.
 */
const fetchVersionConfig = async (): Promise<AppVersionResponse | null> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(VERSION_ENDPOINT, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) {
      console.warn(`[AppUpdate] Version endpoint returned HTTP ${response.status}`);
      return null;
    }

    const json = await response.json();

    // Basic structural validation
    if (
      !json?.success ||
      !json?.data?.latestVersion ||
      !json?.data?.minimumVersion
    ) {
      console.warn('[AppUpdate] Malformed version response from backend');
      return null;
    }

    return json as AppVersionResponse;
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.warn('[AppUpdate] Version check timed out');
    } else {
      console.warn('[AppUpdate] Version check failed:', error);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
};

// ──────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────

/**
 * Performs an app version check against the backend.
 *
 * @param force  When true, bypasses the cooldown. Use only for manual retry.
 * @returns      UpdateCheckResult, or null if:
 *               – cooldown has not expired and force === false
 *               – backend is unreachable / returns invalid data
 *
 * The caller should treat null as "no action needed" and let the user
 * continue using the app normally.
 */
export const checkForUpdate = async (
  force = false
): Promise<UpdateCheckResult | null> => {
  if (!force && !isCooldownExpired()) {
    return null;
  }

  lastCheckTimestamp = Date.now();

  const config = await fetchVersionConfig();
  if (!config) return null;

  const { latestVersion, minimumVersion, android, updateRequired, releaseNotes } = config.data;

  // Validate versions
  if (!isValidVersion(latestVersion) || !isValidVersion(minimumVersion)) {
    console.warn('[AppUpdate] Invalid version strings in response');
    return null;
  }

  const installedVersion = getInstalledVersion();
  const apkUrl = validateApkUrl(android?.apkUrl);

  // Determine update status
  let status: UpdateStatus = 'no_update';

  const mandatoryByVersion = isMandatoryUpdate(installedVersion, minimumVersion);
  const updateAvailable = isUpdateAvailable(installedVersion, latestVersion);

  if (mandatoryByVersion || (updateRequired && updateAvailable)) {
    status = 'mandatory';
  } else if (updateAvailable) {
    status = 'optional';
  }

  return {
    status,
    installedVersion,
    latestVersion,
    minimumVersion,
    apkUrl,
    releaseNotes: Array.isArray(releaseNotes) ? releaseNotes : [],
    updateRequired,
  };
};

/**
 * Opens the APK URL using the OS default handler (browser → file download → installer).
 *
 * On Android 8+ the user will be prompted by the system to allow "Install unknown apps"
 * if not already enabled — this is the expected, secure, user-consented flow.
 *
 * Returns true if the URL was opened successfully, false otherwise.
 */
export const openApkDownload = async (apkUrl: string): Promise<boolean> => {
  const safeUrl = validateApkUrl(apkUrl);
  if (!safeUrl) {
    console.error('[AppUpdate] Attempted to open an invalid or non-HTTPS APK URL.');
    return false;
  }

  try {
    const canOpen = await Linking.canOpenURL(safeUrl);
    if (!canOpen) {
      console.warn('[AppUpdate] Cannot open URL:', safeUrl);
      return false;
    }
    await Linking.openURL(safeUrl);
    return true;
  } catch (error) {
    console.error('[AppUpdate] Failed to open APK URL:', error);
    return false;
  }
};

/**
 * Returns the currently installed app version string.
 * Exposed so the update UI can display "Current version: x.y.z".
 */
export const getInstalledAppVersion = (): string => {
  return getInstalledVersion();
};

/**
 * Resets the cooldown timer, forcing the next checkForUpdate call
 * to actually hit the network. Useful after app resumes from background.
 */
export const resetUpdateCheckCooldown = (): void => {
  lastCheckTimestamp = null;
};
