'use strict';

const crypto = require('crypto');
const axios = require('axios');
const logger = require('../utils/logger');

/**
 * Phone Number Normalization Helper (E.164 Format)
 * Normalizes Indian mobile numbers to +91XXXXXXXXXX
 */
const normalizePhone = (rawPhone) => {
  if (!rawPhone) return '';
  let cleaned = String(rawPhone).trim().replace(/[^\d+]/g, '');

  if (cleaned.startsWith('+')) {
    return cleaned;
  }

  // If 10 digits (e.g. 9876543210), append +91
  if (cleaned.length === 10) {
    return `+91${cleaned}`;
  }

  // If 12 digits starting with 91 (e.g. 919876543210), prepend +
  if (cleaned.length === 12 && cleaned.startsWith('91')) {
    return `+${cleaned}`;
  }

  return `+91${cleaned.slice(-10)}`;
};

/**
 * Generates a cryptographically secure 6-digit numeric OTP code.
 */
const generate6DigitCode = () => {
  return crypto.randomInt(100000, 999999).toString();
};

/**
 * Hashes OTP code using SHA-256. Plaintext is NEVER saved to MongoDB.
 */
const hashOTP = (otpCode) => {
  return crypto.createHash('sha256').update(String(otpCode).trim()).digest('hex');
};

/**
 * Sends SMS OTP via configured SMS Provider (MSG91 OTP API / Flow).
 * Abstracted to support environment variable configuration on Render.
 */
const sendSMS = async (phone, otpCode, purpose = 'VERIFICATION') => {
  const provider = (process.env.OTP_PROVIDER || 'MSG91').toUpperCase();
  const normalized = normalizePhone(phone);
  const mobileNumberNoPlus = normalized.replace('+', '');

  // Safety check for test/mock environment
  if (process.env.NODE_ENV === 'test' || provider === 'MOCK') {
    logger.info(`[MOCK OTP SERVICE] SMS dispatch simulated for ${normalized} (Purpose: ${purpose})`);
    return { success: true, provider: 'MOCK', phone: normalized };
  }

  if (provider === 'MSG91') {
    const authKey = process.env.MSG91_AUTH_KEY;
    const templateId = process.env.MSG91_TEMPLATE_ID;

    if (!authKey || !templateId) {
      const configErr = 'SMS Provider not configured on Render. Please set MSG91_AUTH_KEY and MSG91_TEMPLATE_ID in environment variables.';
      logger.error(`[OTP SERVICE ERROR] ${configErr}`);
      return {
        success: false,
        error: configErr,
        providerConfigured: false,
      };
    }

    try {
      const url = `https://control.msg91.com/api/v5/otp`;
      const response = await axios.post(
        url,
        {
          template_id: templateId,
          mobile: mobileNumberNoPlus,
          otp: otpCode,
        },
        {
          headers: {
            authkey: authKey,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );

      if (response.data && (response.data.type === 'success' || response.status === 200)) {
        logger.info(`[MSG91 OTP SERVICE] SMS OTP dispatched successfully to mobile ${mobileNumberNoPlus}`);
        return { success: true, provider: 'MSG91', phone: normalized };
      } else {
        const errMsg = response.data?.message || 'MSG91 SMS dispatch returned error response';
        logger.error(`[MSG91 OTP SERVICE ERROR] ${errMsg}`);
        return { success: false, error: errMsg, provider: 'MSG91' };
      }
    } catch (error) {
      const errMsg = error.response?.data?.message || error.message || 'Failed to dispatch SMS via MSG91';
      logger.error(`[MSG91 OTP SERVICE HTTP ERROR] ${errMsg}`);
      return { success: false, error: errMsg, provider: 'MSG91' };
    }
  }

  return {
    success: false,
    error: `Unsupported OTP_PROVIDER '${provider}'. Please configure MSG91 credentials on Render.`,
    providerConfigured: false,
  };
};

module.exports = {
  normalizePhone,
  generate6DigitCode,
  hashOTP,
  sendSMS,
};
