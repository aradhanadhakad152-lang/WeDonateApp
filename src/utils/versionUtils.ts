/**
 * versionUtils.ts
 * ============================================================
 * Semantic version comparison utilities for in-app update checks.
 *
 * Handles:
 *   "1.0.0"  "1.0"  "1.0.1"  "1.10.0"  "2.0.0"
 *
 * Comparison is always numeric — never lexicographic — so "1.10.0" > "1.9.0".
 *
 * All functions return safe defaults on malformed input instead of throwing,
 * so a broken backend response never crashes the app.
 */

/**
 * Normalises a version string to an array of three numeric parts.
 *
 * "1.2"     → [1, 2, 0]
 * "1.2.3"   → [1, 2, 3]
 * "  1.2.3" → [1, 2, 3]
 * "abc"     → null  (invalid)
 * ""        → null  (invalid)
 */
const parseParts = (version: string): [number, number, number] | null => {
  if (!version || typeof version !== 'string') return null;

  const trimmed = version.trim();
  // Remove a leading "v" if present (e.g. "v1.0.0")
  const cleaned = trimmed.startsWith('v') ? trimmed.slice(1) : trimmed;

  const parts = cleaned.split('.');
  if (parts.length < 1 || parts.length > 3) return null;

  const nums = parts.map(Number);
  if (nums.some((n) => !Number.isFinite(n) || n < 0 || !Number.isInteger(n))) {
    return null;
  }

  return [nums[0] ?? 0, nums[1] ?? 0, nums[2] ?? 0];
};

/**
 * Compares two semantic version strings.
 *
 * Returns:
 *   -1  if  a < b
 *    0  if  a === b
 *    1  if  a > b
 *   null if either version is malformed
 */
export const compareVersions = (
  a: string,
  b: string
): -1 | 0 | 1 | null => {
  const pa = parseParts(a);
  const pb = parseParts(b);

  if (!pa || !pb) return null;

  for (let i = 0; i < 3; i++) {
    if (pa[i] < pb[i]) return -1;
    if (pa[i] > pb[i]) return 1;
  }
  return 0;
};

/**
 * Returns true if installedVersion is strictly older than latestVersion.
 * Returns false on any malformed input (safe default = no update needed).
 */
export const isUpdateAvailable = (
  installedVersion: string,
  latestVersion: string
): boolean => {
  const result = compareVersions(installedVersion, latestVersion);
  return result === -1;
};

/**
 * Returns true when the installed version is below the minimum supported version,
 * meaning a mandatory update must be enforced.
 * Returns false on any malformed input.
 */
export const isMandatoryUpdate = (
  installedVersion: string,
  minimumVersion: string
): boolean => {
  const result = compareVersions(installedVersion, minimumVersion);
  return result === -1;
};

/**
 * Returns true when the version string can be safely parsed.
 */
export const isValidVersion = (version: string): boolean => {
  return parseParts(version) !== null;
};
