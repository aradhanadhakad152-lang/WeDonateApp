'use strict';

const User = require('../models/User');
const { verifyAccessToken } = require('../services/jwtService');
const { sendError } = require('../utils/apiResponse');
const logger = require('../utils/logger');

/**
 * Authentication Middleware
 *
 * Verifies the short-lived JWT Access Token sent in the `Authorization` header
 * (Format: `Bearer <token>`).
 *
 * Attaches the authenticated User model instance to `req.user`.
 * Checks if user account is suspended.
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    logger.info(`[AUTH DIAGNOSTIC] Route reached: ${req.method} ${req.originalUrl} | Authorization header present: ${!!authHeader}`);

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn(`[AUTH REJECTION 401] Route: ${req.originalUrl} | Reason: Missing or malformed Authorization header`);
      return sendError(res, {
        statusCode: 401,
        message: 'Authentication required. Missing or malformed Authorization header.',
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token);
    logger.info(`[AUTH DIAGNOSTIC] Decoded JWT User ID: ${decoded.userId} | Role: ${decoded.role || 'UNKNOWN'}`);

    const user = await User.findById(decoded.userId);

    if (!user) {
      logger.warn(`[AUTH REJECTION 401] Route: ${req.originalUrl} | Reason: User ${decoded.userId} no longer exists in DB`);
      return sendError(res, {
        statusCode: 401,
        message: 'Authenticated user no longer exists.',
      });
    }

    if (user.accountStatus === 'SUSPENDED') {
      logger.warn(`[AUTH REJECTION 403] Route: ${req.originalUrl} | Reason: User ${user._id} account status is SUSPENDED`);
      return sendError(res, {
        statusCode: 403,
        message: 'Account has been suspended. Please contact support.',
      });
    }

    req.user = user;
    req.tokenPayload = decoded;
    next();
  } catch (error) {
    logger.warn(`[AUTH REJECTION] Route: ${req.originalUrl} | Reason: ${error.message} | Code: ${error.statusCode || 401}`);
    if (error.statusCode) {
      return sendError(res, {
        statusCode: error.statusCode,
        message: error.message,
      });
    }

    return sendError(res, {
      statusCode: 401,
      message: 'Invalid or expired access token.',
    });
  }
};

module.exports = authenticate;
