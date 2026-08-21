'use strict';

const logger = require('../utils/logger');

/**
 * Blood Request Lifecycle & Expiration Service
 *
 * Enforces valid state transitions and expiration handling.
 */

const VALID_TRANSITIONS = {
  OPEN: ['MATCHING', 'ACCEPTED', 'CANCELLED', 'EXPIRED'],
  MATCHING: ['ACCEPTED', 'CANCELLED', 'EXPIRED'],
  ACCEPTED: ['FULFILLED', 'CANCELLED'],
  FULFILLED: [],
  CANCELLED: [],
  EXPIRED: [],
};

/**
 * Validates a status transition.
 * Throws a 400 Bad Request error if transition is illegal.
 *
 * @param {string} currentStatus
 * @param {string} newStatus
 */
const validateStatusTransition = (currentStatus, newStatus) => {
  if (currentStatus === newStatus) return; // No change

  const allowedNextStatuses = VALID_TRANSITIONS[currentStatus] || [];
  if (!allowedNextStatuses.includes(newStatus)) {
    const error = new Error(`Cannot transition blood request from status '${currentStatus}' to '${newStatus}'`);
    error.statusCode = 400;
    throw error;
  }
};

/**
 * Checks if a blood request has passed its requiredBy timestamp.
 * If expired and currently OPEN or MATCHING, updates status to EXPIRED.
 *
 * @param {object} requestDoc - Mongoose BloodRequest document
 * @returns {boolean} True if status changed to EXPIRED
 */
const evaluateRequestExpiration = (requestDoc) => {
  if (!requestDoc || !requestDoc.requiredBy) return false;

  const now = new Date();
  const requiredByDate = new Date(requestDoc.requiredBy);

  if (now > requiredByDate && ['OPEN', 'MATCHING'].includes(requestDoc.status)) {
    logger.info(`BloodRequest ${requestDoc._id} expired (requiredBy: ${requestDoc.requiredBy})`);
    requestDoc.status = 'EXPIRED';
    return true;
  }
  return false;
};

module.exports = {
  VALID_TRANSITIONS,
  validateStatusTransition,
  evaluateRequestExpiration,
};
