'use strict';

const User = require('../models/User');
const { verifyAccessToken } = require('../services/jwtService');
const { sendError } = require('../utils/apiResponse');

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

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return sendError(res, {
        statusCode: 401,
        message: 'Authentication required. Missing or malformed Authorization header.',
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token);

    const user = await User.findById(decoded.userId);

    if (!user) {
      return sendError(res, {
        statusCode: 401,
        message: 'Authenticated user no longer exists.',
      });
    }

    if (user.accountStatus === 'SUSPENDED') {
      return sendError(res, {
        statusCode: 403,
        message: 'Account has been suspended. Please contact support.',
      });
    }

    req.user = user;
    req.tokenPayload = decoded;
    next();
  } catch (error) {
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
