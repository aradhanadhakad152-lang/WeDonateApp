'use strict';

/**
 * Standardized API response helpers.
 * All API responses must go through these functions to ensure consistency.
 */

/**
 * Send a success response.
 * @param {object} res - Express response object
 * @param {object} options
 * @param {number}  options.statusCode - HTTP status code (default: 200)
 * @param {string}  options.message    - Human-readable message
 * @param {any}     options.data       - Response payload
 * @param {object}  options.meta       - Optional pagination or extra metadata
 */
const sendSuccess = (res, { statusCode = 200, message = 'Success', data = null, meta = null } = {}) => {
  const response = {
    success: true,
    message,
    ...(data !== null && { data }),
    ...(meta !== null && { meta }),
    timestamp: new Date().toISOString(),
  };
  return res.status(statusCode).json(response);
};

/**
 * Send an error response.
 * SECURITY: Never include stack traces or internal details in production responses.
 * @param {object} res - Express response object
 * @param {object} options
 * @param {number}  options.statusCode - HTTP status code (default: 500)
 * @param {string}  options.message    - Human-readable error message
 * @param {any}     options.errors     - Validation errors array (optional)
 */
const sendError = (res, { statusCode = 500, message = 'Internal server error', errors = null } = {}) => {
  const response = {
    success: false,
    message,
    ...(errors !== null && { errors }),
    timestamp: new Date().toISOString(),
  };
  return res.status(statusCode).json(response);
};

/**
 * Send a paginated success response.
 */
const sendPaginated = (res, { data, page, limit, total, message = 'Success' }) => {
  return sendSuccess(res, {
    message,
    data,
    meta: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
};

module.exports = { sendSuccess, sendError, sendPaginated };
