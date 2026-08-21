'use strict';

/**
 * Wraps async route handlers to catch errors and pass them to Express error middleware.
 * Eliminates the need for try/catch in every controller.
 *
 * Usage:
 *   router.get('/route', asyncHandler(async (req, res) => {
 *     // no try/catch needed
 *   }));
 *
 * @param {Function} fn - Async route handler
 * @returns {Function} Wrapped handler
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
