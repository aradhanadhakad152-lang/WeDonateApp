'use strict';

/**
 * Resolves App Version & Update configuration from environment variables.
 */
const getAppVersionConfig = () => {
  const latestVersion = (process.env.APP_LATEST_VERSION || '1.0.0').trim();
  const minimumVersion = (process.env.APP_MINIMUM_VERSION || '1.0.0').trim();
  const apkUrl = (
    process.env.APP_ANDROID_APK_URL ||
    'https://github.com/aradhanadhakad152-lang/WeDonateApp/releases/download/v1.0.0/wedonate-1.0.0.apk'
  ).trim();

  const updateRequired = process.env.APP_UPDATE_REQUIRED === 'true';

  let releaseNotes = ['Initial production release'];
  if (process.env.APP_RELEASE_NOTES) {
    try {
      const parsed = JSON.parse(process.env.APP_RELEASE_NOTES);
      if (Array.isArray(parsed)) {
        releaseNotes = parsed;
      } else if (typeof parsed === 'string') {
        releaseNotes = [parsed];
      }
    } catch {
      releaseNotes = process.env.APP_RELEASE_NOTES.split(',').map((n) => n.trim()).filter(Boolean);
    }
  }

  return {
    latestVersion,
    minimumVersion,
    android: {
      version: latestVersion,
      apkUrl,
    },
    updateRequired,
    releaseNotes,
  };
};

module.exports = {
  getAppVersionConfig,
};
