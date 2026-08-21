'use strict';

const User = require('../models/User');
const { verifyFirebaseIdToken } = require('../services/firebaseService');
const { generateTokenPair, verifyRefreshToken, hashToken } = require('../services/jwtService');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../utils/logger');

/**
 * Auth Controller
 *
 * Implements real Firebase ID token verification, MongoDB User upsert,
 * SHA-256 hashed refresh token storage, token rotation, and logout.
 */

// POST /api/v1/auth/firebase-login
const firebaseLogin = asyncHandler(async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return sendError(res, {
      statusCode: 400,
      message: 'Firebase ID Token is required in Authorization header (Bearer <token>)',
    });
  }

  const idToken = authHeader.split(' ')[1];
  const { deviceToken } = req.body;

  // 1. Cryptographically verify Firebase ID Token using Firebase Admin SDK
  const { uid, phone } = await verifyFirebaseIdToken(idToken);

  // 2. Upsert User in MongoDB Atlas (NEVER trust client-provided phone numbers)
  let user = await User.findOne({ firebaseUid: uid });

  if (!user) {
    // Check if phone number exists under different account
    user = await User.findOne({ phone });
    if (user) {
      user.firebaseUid = uid;
    } else {
      // Create new user account
      user = new User({
        firebaseUid: uid,
        phone,
        role: 'CITIZEN',
        accountStatus: 'ACTIVE',
        isVerified: true,
      });
    }
  }

  // Update audit fields
  user.lastLogin = new Date();
  if (deviceToken) {
    user.deviceToken = deviceToken;
  }

  // 3. Issue short-lived Access Token (30m) & long-lived Refresh Token (30d)
  const tokens = generateTokenPair(user);

  // 4. Store SHA-256 hash of Refresh Token in MongoDB (NEVER store raw tokens)
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  
  // Clean up expired hashes first
  user.refreshTokenHashes = (user.refreshTokenHashes || []).filter(
    (item) => item.expiresAt > new Date()
  );

  user.refreshTokenHashes.push({
    hash: tokens.tokenHash,
    createdAt: new Date(),
    expiresAt,
  });

  await user.save();

  logger.info(`User logged in via Firebase: ${user._id} (${user.phone})`);

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Authentication successful',
    data: {
      user: user.toProfileJSON(),
      tokens: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
      },
    },
  });
});

// POST /api/v1/auth/refresh
const refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken: rawRefreshToken } = req.body;

  if (!rawRefreshToken) {
    return sendError(res, {
      statusCode: 400,
      message: 'Refresh token is required in body',
    });
  }

  // 1. Verify Refresh Token signature & expiration
  const decoded = verifyRefreshToken(rawRefreshToken);

  // 2. Hash incoming refresh token
  const incomingHash = hashToken(rawRefreshToken);

  // 3. Find User in MongoDB
  const user = await User.findById(decoded.userId);
  if (!user) {
    return sendError(res, {
      statusCode: 401,
      message: 'User no longer exists',
    });
  }

  // 4. Check if token hash exists in user's refreshTokenHashes array
  const hashIndex = (user.refreshTokenHashes || []).findIndex(
    (item) => item.hash === incomingHash && item.expiresAt > new Date()
  );

  if (hashIndex === -1) {
    logger.warn(`Potential token reuse or revoked refresh token used for user: ${user._id}`);
    return sendError(res, {
      statusCode: 401,
      message: 'Refresh token is invalid or has been revoked',
    });
  }

  // 5. Token Rotation: Remove old hash
  user.refreshTokenHashes.splice(hashIndex, 1);

  // 6. Issue new token pair
  const newTokens = generateTokenPair(user);
  const newExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  user.refreshTokenHashes.push({
    hash: newTokens.tokenHash,
    createdAt: new Date(),
    expiresAt: newExpiresAt,
  });

  await user.save();

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Token refreshed successfully',
    data: {
      tokens: {
        accessToken: newTokens.accessToken,
        refreshToken: newTokens.refreshToken,
        expiresIn: newTokens.expiresIn,
      },
    },
  });
});

// POST /api/v1/auth/logout
const logout = asyncHandler(async (req, res) => {
  const { refreshToken: rawRefreshToken } = req.body;
  const user = req.user;

  if (rawRefreshToken && user.refreshTokenHashes) {
    const incomingHash = hashToken(rawRefreshToken);
    user.refreshTokenHashes = user.refreshTokenHashes.filter(
      (item) => item.hash !== incomingHash
    );
    user.deviceToken = null;
    await user.save();
  }

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Logged out successfully',
  });
});

// GET /api/v1/users/me
const getMe = asyncHandler(async (req, res) => {
  return sendSuccess(res, {
    statusCode: 200,
    message: 'User profile retrieved successfully',
    data: {
      user: req.user.toProfileJSON(),
    },
  });
});

module.exports = {
  firebaseLogin,
  refreshToken,
  logout,
  getMe,
};
