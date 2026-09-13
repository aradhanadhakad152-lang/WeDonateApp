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

// POST /api/v1/auth/admin-login
const adminLogin = asyncHandler(async (req, res) => {
  const { email, phone, password } = req.body;

  let query = null;
  if (email) {
    query = { email: email.toLowerCase() };
  } else if (phone) {
    const rawPhone = String(phone).trim();
    const cleanPhone = rawPhone.startsWith('+') ? rawPhone : `+91${rawPhone}`;
    query = { $or: [{ phone: rawPhone }, { phone: cleanPhone }] };
  }

  if (!query) {
    return sendError(res, {
      statusCode: 400,
      message: 'Email or phone number is required',
    });
  }

  const user = await User.findOne(query).select('+password');

  if (!user || !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
    return sendError(res, {
      statusCode: 401,
      message: 'Invalid administrative credentials or unauthorized role',
    });
  }

  if (user.accountStatus === 'SUSPENDED') {
    return sendError(res, {
      statusCode: 403,
      message: 'Account is suspended',
    });
  }

  if (user.password && password) {
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return sendError(res, {
        statusCode: 401,
        message: 'Invalid administrative credentials',
      });
    }
  }

  const tokens = generateTokenPair(user);
  user.lastLogin = new Date();
  await user.save();

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Admin login successful',
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

// POST /api/v1/auth/dev-login
const devLogin = asyncHandler(async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      success: false,
      message: 'Development login is disabled in production',
      timestamp: new Date().toISOString()
    });
  }

  const { phone = '+919999988888' } = req.body;

  let user = await User.findOne({ phone });
  if (!user) {
    user = await User.create({
      fullName: 'System Super Admin',
      phone,
      email: 'admin@wedonate.org',
      role: 'SUPER_ADMIN',
      accountStatus: 'ACTIVE',
      isVerified: true
    });
  }

  const tokens = generateTokenPair(user);
  user.lastLogin = new Date();
  await user.save();

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Dev admin login successful',
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

// POST /api/v1/auth/phone-login — Citizen Mobile Phone Login & Registration
const phoneLogin = asyncHandler(async (req, res) => {
  const { phone, fullName, email, deviceToken } = req.body;

  if (!phone) {
    return sendError(res, {
      statusCode: 400,
      message: 'Phone number is required',
    });
  }

  const formattedPhone = phone.trim().startsWith('+') ? phone.trim() : `+91${phone.trim()}`;
  if (!/^\+[1-9]\d{7,14}$/.test(formattedPhone)) {
    return sendError(res, {
      statusCode: 400,
      message: 'Phone must be in valid E.164 format (e.g. +919876543210)',
    });
  }

  let user = await User.findOne({ phone: formattedPhone });

  if (!user) {
    const timestamp = Date.now();
    user = new User({
      firebaseUid: `phone_${timestamp}_${Math.random().toString(36).substring(2, 7)}`,
      phone: formattedPhone,
      fullName: fullName || 'Citizen User',
      name: fullName || 'Citizen User',
      email: email ? email.toLowerCase() : undefined,
      role: 'CITIZEN',
      accountStatus: 'ACTIVE',
      isVerified: true,
    });
  } else {
    if (fullName && (!user.fullName || !user.name)) {
      user.fullName = fullName;
      user.name = fullName;
    }
  }

  if (user.accountStatus === 'SUSPENDED') {
    logger.warn(`[PHONE-LOGIN REJECTION 403] User ${user._id} account status is SUSPENDED`);
    return sendError(res, {
      statusCode: 403,
      message: 'Account has been suspended. Please contact support.',
    });
  }

  user.lastLogin = new Date();
  if (deviceToken) {
    user.deviceToken = deviceToken;
  }

  const tokens = generateTokenPair(user);

  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  user.refreshTokenHashes = (user.refreshTokenHashes || []).filter(
    (item) => item.expiresAt > new Date()
  );
  user.refreshTokenHashes.push({
    hash: tokens.tokenHash,
    createdAt: new Date(),
    expiresAt,
  });

  await user.save();

  logger.info(`Citizen logged in via phone-login: ${user._id} (${user.phone})`);

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

// GET /api/v1/auth/whatsapp-status — Safe WhatsApp environment status query
const getWhatsAppStatus = asyncHandler(async (req, res) => {
  const { getWhatsAppConfigStatus } = require('../services/whatsappService');
  const status = getWhatsAppConfigStatus();
  return sendSuccess(res, {
    statusCode: 200,
    message: 'WhatsApp environment configuration status',
    data: { whatsappConfig: status },
  });
});

module.exports = {
  firebaseLogin,
  phoneLogin,
  refreshToken,
  logout,
  getMe,
  adminLogin,
  devLogin,
  getWhatsAppStatus,
};
