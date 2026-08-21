'use strict';

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const logger = require('../utils/logger');

/**
 * JWT Service
 *
 * Handles issuance, verification, SHA-256 token hashing, and payload construction
 * for short-lived Access Tokens (30m) and long-lived Refresh Tokens (30d).
 *
 * SECURITY RULES:
 * - Access token expiration: 30 minutes.
 * - Refresh token expiration: 30 days.
 * - Raw refresh tokens are NEVER stored in MongoDB — only SHA-256 hashes are stored.
 * - Payload contains only essential non-sensitive claims: userId, firebaseUid, phone, role.
 */

const getAccessSecret = () => {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    throw new Error('JWT_ACCESS_SECRET environment variable is missing');
  }
  return secret;
};

const getRefreshSecret = () => {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) {
    throw new Error('JWT_REFRESH_SECRET environment variable is missing');
  }
  return secret;
};

/**
 * Hashes a raw token string using SHA-256.
 * Safe for database index matching and storage.
 * @param {string} token
 * @returns {string} 64-character hex hash
 */
const hashToken = (token) => {
  if (!token || typeof token !== 'string') {
    throw new Error('Invalid token provided for hashing');
  }
  return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * Generates an Access Token (30 minutes).
 * @param {object} user - User document
 * @returns {string} JWT Access Token
 */
const generateAccessToken = (user) => {
  const payload = {
    userId: user._id.toString(),
    firebaseUid: user.firebaseUid,
    phone: user.phone,
    role: user.role || 'CITIZEN',
  };

  const options = {
    expiresIn: process.env.JWT_ACCESS_EXPIRY || '30m',
    issuer: 'WE-DONATE-API',
  };

  return jwt.sign(payload, getAccessSecret(), options);
};

/**
 * Generates a Refresh Token (30 days).
 * @param {object} user - User document
 * @param {string} tokenId - Unique token ID for rotation tracking
 * @returns {string} JWT Refresh Token
 */
const generateRefreshToken = (user, tokenId = crypto.randomBytes(16).toString('hex')) => {
  const payload = {
    userId: user._id.toString(),
    firebaseUid: user.firebaseUid,
    jti: tokenId,
  };

  const options = {
    expiresIn: process.env.JWT_REFRESH_EXPIRY || '30d',
    issuer: 'WE-DONATE-API',
  };

  return jwt.sign(payload, getRefreshSecret(), options);
};

/**
 * Generates both Access and Refresh tokens for a user.
 * @param {object} user
 * @returns {{ accessToken: string, refreshToken: string, tokenHash: string, expiresIn: number }}
 */
const generateTokenPair = (user) => {
  const tokenId = crypto.randomBytes(16).toString('hex');
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user, tokenId);
  const tokenHash = hashToken(refreshToken);

  return {
    accessToken,
    refreshToken,
    tokenHash,
    expiresIn: 1800, // 30 minutes in seconds
  };
};

/**
 * Verifies an Access Token.
 * @param {string} token
 * @returns {object} Decoded payload
 */
const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, getAccessSecret(), { issuer: 'WE-DONATE-API' });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      const expiredError = new Error('Access token has expired');
      expiredError.statusCode = 401;
      expiredError.code = 'TOKEN_EXPIRED';
      throw expiredError;
    }
    const invalidError = new Error('Invalid access token');
    invalidError.statusCode = 401;
    invalidError.code = 'INVALID_TOKEN';
    throw invalidError;
  }
};

/**
 * Verifies a Refresh Token.
 * @param {string} token
 * @returns {object} Decoded payload
 */
const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, getRefreshSecret(), { issuer: 'WE-DONATE-API' });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      const expiredError = new Error('Refresh token has expired');
      expiredError.statusCode = 401;
      expiredError.code = 'REFRESH_EXPIRED';
      throw expiredError;
    }
    const invalidError = new Error('Invalid refresh token');
    invalidError.statusCode = 401;
    invalidError.code = 'INVALID_REFRESH_TOKEN';
    throw invalidError;
  }
};

module.exports = {
  hashToken,
  generateAccessToken,
  generateRefreshToken,
  generateTokenPair,
  verifyAccessToken,
  verifyRefreshToken,
};
