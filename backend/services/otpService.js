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

/**
 * Sends OTP via Meta WhatsApp Cloud API using approved Authentication template (wedonate_otp).
 */
const sendOTPViaWhatsApp = async (phone, otpCode, purpose = 'LOGIN') => {
  const normalized = normalizePhone(phone);
  const recipientPhone = normalized.replace('+', '');

  const whatsappEnabled = process.env.WHATSAPP_ENABLED !== 'false';
  const provider = (process.env.WHATSAPP_PROVIDER || 'META_CLOUD_API').toUpperCase();
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_API_KEY;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const templateName = process.env.WHATSAPP_OTP_TEMPLATE_NAME || 'wedonate_otp';
  const templateLanguage = process.env.WHATSAPP_OTP_TEMPLATE_LANGUAGE || 'en';

  if (!whatsappEnabled) {
    logger.warn(`[WHATSAPP OTP] Service disabled via WHATSAPP_ENABLED=false`);
    return {
      success: false,
      error: 'WhatsApp OTP service is currently disabled in backend configuration.',
      providerConfigured: false,
    };
  }

  if (process.env.NODE_ENV === 'test' || provider === 'MOCK') {
    logger.info(`[MOCK WHATSAPP OTP] Dispatched 6-digit OTP to ${normalized} (Purpose: ${purpose})`);
    return { success: true, provider: 'MOCK', phone: normalized };
  }

  if (provider === 'META_CLOUD_API') {
    if (!accessToken || !phoneNumberId) {
      const configErr = 'Meta WhatsApp Cloud API credentials missing on backend (WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID).';
      logger.error(`[WHATSAPP OTP CONFIG ERROR] ${configErr}`);
      return {
        success: false,
        error: 'WhatsApp API credentials missing from backend server configuration.',
        providerConfigured: false,
      };
    }

    try {
      const metaUrl = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;

      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientPhone,
        type: 'template',
        template: {
          name: templateName,
          language: { code: templateLanguage },
          components: [
            {
              type: 'body',
              parameters: [
                {
                  type: 'text',
                  text: String(otpCode),
                },
              ],
            },
          ],
        },
      };

      logger.info(`[META WHATSAPP OTP DISPATCH] Template: '${templateName}', Recipient: ${recipientPhone.slice(0, 4)}***${recipientPhone.slice(-2)}`);

      const response = await axios.post(metaUrl, payload, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });

      if (response.data && (response.data.messages || response.status === 200)) {
        const messageId = response.data.messages?.[0]?.id || 'META_WA_OK';
        logger.info(`[META WHATSAPP OTP SUCCESS] Message ID: ${messageId}`);
        return {
          success: true,
          provider: 'META_CLOUD_API',
          messageId,
          phone: normalized,
        };
      } else {
        const errMsg = response.data?.error?.message || 'Meta WhatsApp API returned error response';
        logger.error(`[META WHATSAPP OTP ERROR] ${errMsg}`);
        return {
          success: false,
          error: 'Meta WhatsApp API error: ' + errMsg,
          provider: 'META_CLOUD_API',
        };
      }
    } catch (error) {
      const metaErrMsg = error.response?.data?.error?.message || error.message || 'Failed to dispatch WhatsApp OTP';
      const status = error.response?.status || 500;
      logger.error(`[META WHATSAPP OTP HTTP ERROR] ${metaErrMsg} [HTTP ${status}]`);
      return {
        success: false,
        error: metaErrMsg,
        provider: 'META_CLOUD_API',
      };
    }
  }

  return {
    success: false,
    error: `Unsupported WHATSAPP_PROVIDER '${provider}'. Set WHATSAPP_PROVIDER=META_CLOUD_API on Render.`,
    providerConfigured: false,
  };
};

module.exports = {
  normalizePhone,
  generate6DigitCode,
  hashOTP,
  sendSMS,
  sendOTPViaWhatsApp,
};

