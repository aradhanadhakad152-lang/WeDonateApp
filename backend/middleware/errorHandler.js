'use strict';

const logger = require('../utils/logger');
const { sendError } = require('../utils/apiResponse');

/**
 * Centralized error handling middleware.
 * Must be the LAST middleware registered in server.js.
 *
 * SECURITY:
 * - Never expose stack traces in production responses
 * - Never expose internal error details (DB errors, query details)
 * - Always log internally, respond generically in production
 */
const errorHandler = (err, req, res, next) => {
  // Log the full error internally
  logger.error(`${err.message}`, { 
    stack: err.stack,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
  });

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return sendError(res, {
      statusCode: 422,
      message: 'Validation failed',
      errors,
    });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'field';
    return sendError(res, {
      statusCode: 409,
      message: `A record with this ${field} already exists`,
    });
  }

  // Mongoose CastError (invalid ObjectId)
  if (err.name === 'CastError') {
    return sendError(res, {
      statusCode: 400,
      message: 'Invalid ID format',
    });
  }

  // JWT errors — handled in authenticate middleware but caught here too
  if (err.name === 'JsonWebTokenError') {
    return sendError(res, {
      statusCode: 401,
      message: 'Invalid token',
    });
  }

  if (err.name === 'TokenExpiredError') {
    return sendError(res, {
      statusCode: 401,
      message: 'Token expired',
    });
  }

  // Custom application errors with explicit status codes
  if (err.statusCode) {
    return sendError(res, {
      statusCode: err.statusCode,
      message: err.message,
    });
  }

  // Fallback — generic 500
  // SECURITY: Never expose err.message in production for unexpected errors
  return sendError(res, {
    statusCode: 500,
    message: process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred'
      : err.message || 'Internal server error',
  });
};

/**
 * Create a custom application error with a status code.
 * @param {string} message
 * @param {number} statusCode
 * @returns {Error}
 */
const createError = (message, statusCode = 500) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

module.exports = { errorHandler, createError };
