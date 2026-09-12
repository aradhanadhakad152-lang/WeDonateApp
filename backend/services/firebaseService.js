'use strict';

const admin = require('firebase-admin');
const logger = require('../utils/logger');

let isInitialized = false;

/**
 * Initializes the Firebase Admin SDK using environment variables.
 * Project ID target: we-donate-8170b
 *
 * SECURITY:
 * - Credentials are read strictly from environment variables.
 * - No service account JSON file is ever committed to source control.
 */
const initFirebaseAdmin = () => {
  if (isInitialized || admin.apps.length > 0) {
    isInitialized = true;
    return admin.app();
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || 'we-donate-8170b';
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!clientEmail || !privateKey) {
    logger.warn('FIREBASE_CLIENT_EMAIL or FIREBASE_PRIVATE_KEY missing from environment — Firebase Admin running in stub/mock mode for local unit tests');
    isInitialized = true;
    return null;
  }

  // Handle escaped line breaks in private key string from .env
  if (privateKey.includes('\\n')) {
    privateKey = privateKey.replace(/\\n/g, '\n');
  }

  try {
    const app = admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
    isInitialized = true;
    logger.info(`Firebase Admin SDK initialized successfully for project: ${projectId}`);
    return app;
  } catch (error) {
    logger.error(`Failed to initialize Firebase Admin SDK: ${error.message}`);
    throw error;
  }
};

/**
 * Verifies a Firebase ID Token received from the client mobile app.
 * Extracts the cryptographically verified Firebase UID and phone number.
 *
 * @param {string} idToken - Firebase ID Token
 * @returns {Promise<{ uid: string, phone: string, decodedToken: object }>}
 */
const verifyFirebaseIdToken = async (idToken) => {
  if (!idToken || typeof idToken !== 'string') {
    const err = new Error('Firebase ID Token is required');
    err.statusCode = 400;
    throw err;
  }

  // If Firebase Admin isn't initialized or running in test mode
  if (admin.apps.length === 0) {
    initFirebaseAdmin();
  }

  // Mock verification for local unit testing when credentials are dummy
  if (process.env.NODE_ENV === 'test' && (!process.env.FIREBASE_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL.includes('mock'))) {
    if (idToken === 'VALID_MOCK_FIREBASE_ID_TOKEN') {
      return {
        uid: 'MOCK_FIREBASE_UID_12345',
        phone: '+919876543210',
        decodedToken: { uid: 'MOCK_FIREBASE_UID_12345', phone_number: '+919876543210' },
      };
    }
    const err = new Error('Invalid Firebase ID Token');
    err.statusCode = 401;
    throw err;
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;
    const phone = decodedToken.phone_number;

    if (!phone) {
      const err = new Error('Firebase identity does not contain a verified phone number');
      err.statusCode = 400;
      throw err;
    }

    return {
      uid,
      phone,
      decodedToken,
    };
  } catch (error) {
    logger.error(`Firebase ID Token verification failed: ${error.message}`);
    const err = new Error('Invalid or expired Firebase ID Token');
    err.statusCode = 401;
    throw err;
  }
};

module.exports = {
  initFirebaseAdmin,
  verifyFirebaseIdToken,
};
