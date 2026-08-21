'use strict';

const logger = require('../utils/logger');

/**
 * Emergency SMS Service Provider Abstraction
 *
 * ENVIRONMENT VARIABLES:
 * - SMS_ENABLED: 'true' | 'false' (Default: false)
 * - SMS_PROVIDER: 'TWILIO' | 'GENERIC' (Default: GENERIC)
 * - SMS_API_KEY: Secret provider API key
 * - SMS_API_SECRET: Secret provider API secret
 * - SMS_FROM: Sender ID / phone number
 * - SMS_MAX_DONORS_PER_REQUEST: Maximum SMS alerts per request (Default: 3)
 */

const SMS_ENABLED = process.env.SMS_ENABLED === 'true';
const SMS_PROVIDER = process.env.SMS_PROVIDER || 'GENERIC';
const SMS_API_KEY = process.env.SMS_API_KEY;
const SMS_FROM = process.env.SMS_FROM || 'WE DONATE';
const SMS_MAX_DONORS_PER_REQUEST = Number(process.env.SMS_MAX_DONORS_PER_REQUEST) || 3;

/**
 * Sends an emergency SMS alert to a validated phone number.
 *
 * @param {string} phoneNumber - E.164 formatted phone number (e.g. +919876543210)
 * @param {string} messageContent - Short emergency text message
 * @returns {Promise<{ sent: boolean, providerId?: string, reason?: string }>}
 */
const sendEmergencySMS = async (phoneNumber, messageContent) => {
  if (!phoneNumber || !/^\+[1-9]\d{7,14}$/.test(phoneNumber.trim())) {
    logger.warn(`SMS dispatch rejected: Invalid phone number format '${phoneNumber}'`);
    return { sent: false, reason: 'Invalid phone number format' };
  }

  const cleanPhone = phoneNumber.trim();

  // If SMS is disabled in environment settings
  if (!SMS_ENABLED) {
    logger.debug(`SMS dispatch skipped for ${cleanPhone}: SMS_ENABLED is set to false`);
    return {
      sent: false,
      reason: 'SMS provider is disabled in environment configuration (SMS_ENABLED=false)',
    };
  }

  // Check provider credentials
  if (!SMS_API_KEY) {
    logger.error(`SMS dispatch failed for ${cleanPhone}: Real SMS delivery requires SMS_API_KEY in environment`);
    return {
      sent: false,
      reason: 'SMS provider credentials missing from environment configuration',
    };
  }

  try {
    // Provider specific dispatch logic (e.g. Twilio / HTTP Gateway)
    logger.info(`Sending emergency SMS via ${SMS_PROVIDER} to ${cleanPhone}...`);

    // Simulated provider call (In production, replace with actual Twilio/HTTP API call using process.env secrets)
    const providerMessageId = `SMS_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    return {
      sent: true,
      providerId: providerMessageId,
    };
  } catch (error) {
    // SECURITY: Never log SMS secrets or private provider parameters
    logger.error(`SMS dispatch error for ${cleanPhone}: ${error.message}`);
    return {
      sent: false,
      reason: error.message,
    };
  }
};

module.exports = {
  SMS_ENABLED,
  SMS_MAX_DONORS_PER_REQUEST,
  sendEmergencySMS,
};
