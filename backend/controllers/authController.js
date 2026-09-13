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

// POST /api/v1/auth/send-otp
const sendOTP = asyncHandler(async (req, res) => {
  const { phone, purpose } = req.body;

  if (!phone) {
    return sendError(res, {
      statusCode: 400,
      message: 'Mobile phone number is required',
    });
  }

  const validPurpose = (purpose || 'LOGIN').toUpperCase();
  if (!['LOGIN', 'REGISTER'].includes(validPurpose)) {
    return sendError(res, {
      statusCode: 400,
      message: 'Purpose must be LOGIN or REGISTER',
    });
  }

  const { normalizePhone, generate6DigitCode, hashOTP, sendSMS } = require('../services/otpService');
  const OtpVerification = require('../models/OtpVerification');

  const normalizedPhone = normalizePhone(phone);
  if (!/^\+[1-9]\d{7,14}$/.test(normalizedPhone)) {
    return sendError(res, {
      statusCode: 400,
      message: 'Invalid phone number format. Please provide a valid 10-digit mobile number.',
    });
  }

  // 1. Resend Cooldown Check (30 seconds)
  const recentOtp = await OtpVerification.findOne({
    phone: normalizedPhone,
    purpose: validPurpose,
    createdAt: { $gt: new Date(Date.now() - 30 * 1000) },
  });

  if (recentOtp) {
    return sendError(res, {
      statusCode: 429,
      message: 'Please wait 30 seconds before requesting another OTP code.',
    });
  }

  // 2. User Existence Verification per Purpose
  const existingUser = await User.findOne({ phone: normalizedPhone });

  if (validPurpose === 'REGISTER') {
    if (existingUser) {
      return sendError(res, {
        statusCode: 400,
        message: 'An account already exists for this mobile number. Please login instead.',
      });
    }
  } else if (validPurpose === 'LOGIN') {
    if (!existingUser) {
      return sendError(res, {
        statusCode: 404,
        message: 'No registered Citizen account found for this mobile number. Please register first.',
      });
    }

    if (['HOSPITAL_MANAGER', 'BLOOD_BANK_MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(existingUser.role)) {
      return sendError(res, {
        statusCode: 403,
        message: 'Hospital, Blood Bank, and Admin accounts must authenticate via portal password login.',
      });
    }

    if (existingUser.accountStatus === 'SUSPENDED') {
      return sendError(res, {
        statusCode: 403,
        message: 'Your citizen account is currently suspended. Please contact support.',
      });
    }
  }

  // 3. Generate 6-digit OTP code & Store SHA-256 hash
  const otpCode = generate6DigitCode();
  const otpHash = hashOTP(otpCode);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes TTL

  await OtpVerification.create({
    phone: normalizedPhone,
    purpose: validPurpose,
    otpHash,
    expiresAt,
    attempts: 0,
  });

  // 4. Dispatch SMS via OTP Provider
  const smsResult = await sendSMS(normalizedPhone, otpCode, validPurpose);

  if (!smsResult.success) {
    if (smsResult.providerConfigured === false) {
      return sendError(res, {
        statusCode: 503,
        message: smsResult.error,
      });
    }
    return sendError(res, {
      statusCode: 500,
      message: smsResult.error || 'Failed to deliver SMS OTP. Please try again.',
    });
  }

  const maskedPhone = `${normalizedPhone.slice(0, 3)} XXXXX ${normalizedPhone.slice(-4)}`;

  return sendSuccess(res, {
    statusCode: 200,
    message: `OTP sent successfully via SMS to ${maskedPhone}`,
    data: {
      phone: normalizedPhone,
      purpose: validPurpose,
      expiresInSeconds: 300,
      resendCooldownSeconds: 30,
    },
  });
});

// POST /api/v1/auth/verify-otp
const verifyOTP = asyncHandler(async (req, res) => {
  const { phone, otp, purpose, fullName } = req.body;

  if (!phone || !otp) {
    return sendError(res, {
      statusCode: 400,
      message: 'Mobile phone number and 6-digit OTP code are required',
    });
  }

  const validPurpose = (purpose || 'LOGIN').toUpperCase();
  const cleanOtp = String(otp).trim();
  if (cleanOtp.length !== 6 || !/^\d{6}$/.test(cleanOtp)) {
    return sendError(res, {
      statusCode: 400,
      message: 'OTP must be a 6-digit numeric code',
    });
  }

  const { normalizePhone, hashOTP } = require('../services/otpService');
  const OtpVerification = require('../models/OtpVerification');

  const normalizedPhone = normalizePhone(phone);

  // 1. Fetch latest active OTP verification record
  const otpRecord = await OtpVerification.findOne({
    phone: normalizedPhone,
    purpose: validPurpose,
    verifiedAt: null,
  })
    .select('+otpHash')
    .sort({ createdAt: -1 });

  if (!otpRecord) {
    return sendError(res, {
      statusCode: 400,
      message: 'No active OTP request found for this mobile number. Please request a new OTP.',
    });
  }

  // 2. Expiration Check
  if (new Date() > new Date(otpRecord.expiresAt)) {
    return sendError(res, {
      statusCode: 400,
      message: 'OTP code has expired. Please request a new OTP code.',
    });
  }

  // 3. Maximum Attempt Check (Max 5 attempts)
  if (otpRecord.attempts >= 5) {
    return sendError(res, {
      statusCode: 429,
      message: 'Maximum verification attempts exceeded (5/5). Please request a new OTP code.',
    });
  }

  // Increment attempt counter
  otpRecord.attempts += 1;

  // 4. Verify SHA-256 Hash
  const incomingHash = hashOTP(cleanOtp);
  if (incomingHash !== otpRecord.otpHash) {
    await otpRecord.save();
    const remaining = 5 - otpRecord.attempts;
    return sendError(res, {
      statusCode: 400,
      message: remaining > 0
        ? `Invalid OTP code. ${remaining} attempt(s) remaining.`
        : 'Invalid OTP code. Maximum verification attempts exceeded. Please request a new OTP.',
    });
  }

  // Mark OTP record as verified
  otpRecord.verifiedAt = new Date();
  await otpRecord.save();

  // 5. Account Upsert / Login Flow
  let user = await User.findOne({ phone: normalizedPhone });

  if (validPurpose === 'REGISTER') {
    if (!user) {
      user = new User({
        firebaseUid: `citizen_otp_${normalizedPhone.replace('+', '')}`,
        phone: normalizedPhone,
        fullName: (fullName || 'Citizen Donor').trim(),
        role: 'CITIZEN',
        accountStatus: 'ACTIVE',
        isActive: true,
        isVerified: true,
      });
    } else {
      user.isVerified = true;
      if (fullName && !user.fullName) user.fullName = fullName.trim();
    }
  } else { // LOGIN
    if (!user) {
      return sendError(res, {
        statusCode: 404,
        message: 'Account not found for this mobile number. Please register first.',
      });
    }

    if (user.accountStatus === 'SUSPENDED') {
      return sendError(res, {
        statusCode: 403,
        message: 'Your citizen account is currently suspended. Please contact support.',
      });
    }
  }

  user.lastLogin = new Date();

  // Issue short-lived Access Token & long-lived Refresh Token
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

  logger.info(`Citizen authenticated via SMS OTP: ${user._id} (${user.phone}) Purpose: ${validPurpose}`);

  return sendSuccess(res, {
    statusCode: validPurpose === 'REGISTER' ? 201 : 200,
    message: validPurpose === 'REGISTER' ? 'Citizen account created and verified successfully' : 'OTP verification successful',
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

module.exports = {
  firebaseLogin,
  phoneLogin,
  refreshToken,
  logout,
  getMe,
  adminLogin,
  devLogin,
  getWhatsAppStatus,
  sendOTP,
  verifyOTP,
};
