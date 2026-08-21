'use strict';

const rateLimit = require('express-rate-limit');
const { sendError } = require('../utils/apiResponse');

/**
 * General API rate limiter.
 * Applied globally to all routes.
 */
const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 min default
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),      // 100 requests per window
  standardHeaders: true,   // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false,    // Disable the `X-RateLimit-*` headers
  handler: (req, res) => {
    sendError(res, {
      statusCode: 429,
      message: 'Too many requests. Please try again later.',
    });
  },
  // Skip rate limiting in test environment
  skip: () => process.env.NODE_ENV === 'test',
});

/**
 * Strict rate limiter for authentication endpoints.
 * Prevents brute-force and OTP abuse.
 * 10 requests per 15 minutes per IP.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    sendError(res, {
      statusCode: 429,
      message: 'Too many authentication attempts. Please try again in 15 minutes.',
    });
  },
  skip: () => process.env.NODE_ENV === 'test',
});

module.exports = { generalLimiter, authLimiter };
