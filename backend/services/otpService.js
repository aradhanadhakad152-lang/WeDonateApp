'use strict';

const crypto = require('crypto');
const axios = require('axios');
const logger = require('../utils/logger');

/**
 * Phone Number Normalization Helper (E.164 Format)
 * Normalizes Indian mobile numbers to +91XXXXXXXXXX
 * Supports international formats starting with '+'
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
  return crypto.randomInt(100000, 1000000).toString();
};

/**
 * Hashes OTP code using SHA-256. Plaintext is NEVER saved to MongoDB or logged.
 */
const hashOTP = (otpCode) => {
  return crypto.createHash('sha256').update(String(otpCode).trim()).digest('hex');
};

/**
 * Resolves Meta WhatsApp Cloud API credentials from environment variables.
 * Checks both META_* and WHATSAPP_* naming conventions.
 */
const getMetaCredentials = () => {
  const accessToken = (
    process.env.META_ACCESS_TOKEN ||
    process.env.WHATSAPP_ACCESS_TOKEN ||
    process.env.WHATSAPP_API_KEY ||
    ''
  ).trim();

  const phoneNumberId = (
    process.env.META_PHONE_NUMBER_ID ||
    process.env.WHATSAPP_PHONE_NUMBER_ID ||
    ''
  ).trim();

  const templateName = (
    process.env.META_OTP_TEMPLATE_NAME ||
    process.env.WHATSAPP_OTP_TEMPLATE_NAME ||
    process.env.WHATSAPP_TEMPLATE_NAME ||
    'wedonate_otp'
  ).trim();

  const templateLanguage = (
    process.env.META_OTP_TEMPLATE_LANGUAGE ||
    process.env.WHATSAPP_OTP_TEMPLATE_LANGUAGE ||
    'en'
  ).trim();

  const wabaId = (
    process.env.META_WABA_ID ||
    process.env.WHATSAPP_WABA_ID ||
    ''
  ).trim();

  const verifyToken = (
    process.env.META_VERIFY_TOKEN ||
    process.env.WHATSAPP_VERIFY_TOKEN ||
    ''
  ).trim();

  const enabled = process.env.WHATSAPP_ENABLED !== 'false';

  return {
    accessToken,
    phoneNumberId,
    templateName,
    templateLanguage,
    wabaId,
    verifyToken,
    enabled,
  };
};

/**
 * Queries Meta Graph API to inspect active configuration & approved templates (Safe, no secrets returned).
 */
const getMetaWhatsAppConfigStatus = async () => {
  const creds = getMetaCredentials();

  const envVarNames = {
    META_ACCESS_TOKEN: Boolean(process.env.META_ACCESS_TOKEN),
    META_PHONE_NUMBER_ID: Boolean(process.env.META_PHONE_NUMBER_ID),
    META_WABA_ID: Boolean(process.env.META_WABA_ID),
    META_VERIFY_TOKEN: Boolean(process.env.META_VERIFY_TOKEN),
    META_OTP_TEMPLATE_NAME: process.env.META_OTP_TEMPLATE_NAME || null,
    META_OTP_TEMPLATE_LANGUAGE: process.env.META_OTP_TEMPLATE_LANGUAGE || null,
    WHATSAPP_ACCESS_TOKEN: Boolean(process.env.WHATSAPP_ACCESS_TOKEN),
    WHATSAPP_PHONE_NUMBER_ID: Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID),
    WHATSAPP_OTP_TEMPLATE_NAME: process.env.WHATSAPP_OTP_TEMPLATE_NAME || null,
    WHATSAPP_OTP_TEMPLATE_LANGUAGE: process.env.WHATSAPP_OTP_TEMPLATE_LANGUAGE || null,
    WHATSAPP_ENABLED: process.env.WHATSAPP_ENABLED !== 'false',
    WHATSAPP_PROVIDER: process.env.WHATSAPP_PROVIDER || 'META_CLOUD_API',
  };

  const maskedPhoneId = creds.phoneNumberId
    ? `${creds.phoneNumberId.slice(0, 3)}***${creds.phoneNumberId.slice(-3)}`
    : 'NOT_SET';

  const statusReport = {
    configuredVariables: envVarNames,
    activeConfig: {
      enabled: creds.enabled,
      hasAccessToken: Boolean(creds.accessToken),
      phoneNumberId: maskedPhoneId,
      templateName: creds.templateName,
      templateLanguage: creds.templateLanguage,
      hasWabaId: Boolean(creds.wabaId),
    },
    metaDiagnostics: {
      accountStatus: 'UNKNOWN',
      discoveredWabaId: null,
      approvedTemplates: [],
      error: null,
    },
  };

  // If credentials exist, introspect Meta Cloud API
  if (creds.accessToken && creds.phoneNumberId) {
    try {
      // 1. Check Phone Number details
      const phoneRes = await axios.get(
        `https://graph.facebook.com/v20.0/${creds.phoneNumberId}?fields=verified_name,display_phone_number,quality_rating,whatsapp_business_account`,
        {
          headers: { Authorization: `Bearer ${creds.accessToken}` },
          timeout: 7000,
        }
      );

      statusReport.metaDiagnostics.accountStatus = 'CONNECTED';
      statusReport.metaDiagnostics.verifiedName = phoneRes.data?.verified_name;
      statusReport.metaDiagnostics.displayPhoneNumber = phoneRes.data?.display_phone_number;
      statusReport.metaDiagnostics.qualityRating = phoneRes.data?.quality_rating;

      const discoveredWaba = phoneRes.data?.whatsapp_business_account?.id || creds.wabaId;
      if (discoveredWaba) {
        statusReport.metaDiagnostics.discoveredWabaId = `${discoveredWaba.slice(0, 3)}***${discoveredWaba.slice(-3)}`;

        // 2. Query Approved Templates
        const tplRes = await axios.get(
          `https://graph.facebook.com/v20.0/${discoveredWaba}/message_templates?status=APPROVED&fields=name,status,category,language,components`,
          {
            headers: { Authorization: `Bearer ${creds.accessToken}` },
            timeout: 7000,
          }
        );

        statusReport.metaDiagnostics.approvedTemplates = (tplRes.data?.data || []).map((t) => ({
          name: t.name,
          category: t.category,
          language: t.language,
          status: t.status,
          hasButtons: Boolean(t.components?.some((c) => c.type === 'BUTTONS')),
        }));
      }
    } catch (metaErr) {
      statusReport.metaDiagnostics.accountStatus = 'ERROR';
      statusReport.metaDiagnostics.error =
        metaErr.response?.data?.error?.message || metaErr.message;
    }
  }

  return statusReport;
};

/**
 * Sends OTP via Meta WhatsApp Cloud API using active Authentication template.
 *
 * Automatically tests standard Meta template payload structures:
 * 1. Template with Copy Code button (sub_type: 'copy_code')
 * 2. Template with URL button (sub_type: 'url')
 * 3. Template with Body parameter only
 * 4. Template with Button parameter only
 *
 * @param {string} phone - Target phone number in E.164 format
 * @param {string} otpCode - 6-digit OTP code (NEVER logged or exposed)
 * @param {string} [purpose='LOGIN'] - 'LOGIN' | 'REGISTER'
 * @returns {Promise<{ success: boolean, provider: string, messageId?: string, error?: string, providerConfigured?: boolean }>}
 */
const sendOTPViaWhatsApp = async (phone, otpCode, purpose = 'LOGIN') => {
  const normalized = normalizePhone(phone);
  const recipientPhone = normalized.replace('+', '');
  const creds = getMetaCredentials();

  if (!creds.enabled) {
    logger.warn(`[WHATSAPP OTP] Service disabled via WHATSAPP_ENABLED=false`);
    return {
      success: false,
      error: 'WhatsApp OTP service is currently disabled in backend configuration.',
      providerConfigured: false,
    };
  }

  // Unit test bypass
  if (process.env.NODE_ENV === 'test' && !creds.accessToken) {
    logger.info(`[MOCK WHATSAPP OTP] Unit test simulated dispatch to ${normalized}`);
    return { success: true, provider: 'MOCK', phone: normalized };
  }

  if (!creds.accessToken || !creds.phoneNumberId) {
    const configErr =
      'Meta WhatsApp credentials missing on backend (META_ACCESS_TOKEN or META_PHONE_NUMBER_ID).';
    logger.error(`[WHATSAPP OTP CONFIG ERROR] ${configErr}`);
    return {
      success: false,
      error: 'WhatsApp API credentials missing from backend server configuration.',
      providerConfigured: false,
    };
  }

  try {
    const metaUrl = `https://graph.facebook.com/v20.0/${creds.phoneNumberId}/messages`;

    // Determine candidate templates to try:
    // Configured template name first, plus any approved templates discovered on WABA
    let candidateTemplateNames = [creds.templateName];

    // Try discovering templates dynamically if WABA ID or phone number ID is set
    try {
      let wabaToQuery = creds.wabaId;
      if (!wabaToQuery) {
        const phoneCheck = await axios.get(
          `https://graph.facebook.com/v20.0/${creds.phoneNumberId}?fields=whatsapp_business_account`,
          {
            headers: { Authorization: `Bearer ${creds.accessToken}` },
            timeout: 5000,
          }
        );
        wabaToQuery = phoneCheck.data?.whatsapp_business_account?.id;
      }

      if (wabaToQuery) {
        const tplList = await axios.get(
          `https://graph.facebook.com/v20.0/${wabaToQuery}/message_templates?status=APPROVED&fields=name,category,language,components`,
          {
            headers: { Authorization: `Bearer ${creds.accessToken}` },
            timeout: 5000,
          }
        );
        const approved = (tplList.data?.data || []).map((t) => t.name);
        // Put exact match first if present, then other approved templates
        candidateTemplateNames = Array.from(new Set([creds.templateName, ...approved, 'wedonate_otp']));
      }
    } catch {
      // If template discovery fails, proceed with configured templateName
      candidateTemplateNames = [creds.templateName, 'wedonate_otp'];
    }

    const candidateLanguages = Array.from(
      new Set([creds.templateLanguage, 'en_US', 'en', 'en_GB', 'hi', 'en_IN'])
    );

    let lastErrorMsg = null;
    let successfulResult = null;

    templateLoop: for (const tplName of candidateTemplateNames) {
      for (const langCode of candidateLanguages) {
        // Construct the 4 possible component payload structures supported by Meta Authentication templates

        // Structure 1: Body parameter + Copy Code button parameter
        const payloadCopyCode = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: recipientPhone,
          type: 'template',
          template: {
            name: tplName,
            language: { code: langCode },
            components: [
              {
                type: 'body',
                parameters: [{ type: 'text', text: String(otpCode) }],
              },
              {
                type: 'button',
                sub_type: 'copy_code',
                index: '0',
                parameters: [{ type: 'coupon_code', coupon_code: String(otpCode) }],
              },
            ],
          },
        };

        // Structure 2: Body parameter + URL button parameter
        const payloadUrlButton = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: recipientPhone,
          type: 'template',
          template: {
            name: tplName,
            language: { code: langCode },
            components: [
              {
                type: 'body',
                parameters: [{ type: 'text', text: String(otpCode) }],
              },
              {
                type: 'button',
                sub_type: 'url',
                index: '0',
                parameters: [{ type: 'text', text: String(otpCode) }],
              },
            ],
          },
        };

        // Structure 3: Body parameter ONLY (no buttons)
        const payloadBodyOnly = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: recipientPhone,
          type: 'template',
          template: {
            name: tplName,
            language: { code: langCode },
            components: [
              {
                type: 'body',
                parameters: [{ type: 'text', text: String(otpCode) }],
              },
            ],
          },
        };

        // Structure 4: Button parameter ONLY (sub_type copy_code, no body params)
        const payloadButtonOnly = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: recipientPhone,
          type: 'template',
          template: {
            name: tplName,
            language: { code: langCode },
            components: [
              {
                type: 'button',
                sub_type: 'copy_code',
                index: '0',
                parameters: [{ type: 'coupon_code', coupon_code: String(otpCode) }],
              },
            ],
          },
        };

        const payloadCandidates = [
          { name: 'copy_code', payload: payloadCopyCode },
          { name: 'url_button', payload: payloadUrlButton },
          { name: 'body_only', payload: payloadBodyOnly },
          { name: 'button_only', payload: payloadButtonOnly },
        ];

        for (const candidate of payloadCandidates) {
          try {
            logger.info(
              `[META WHATSAPP OTP ATTEMPT] Template: '${tplName}', Lang: '${langCode}', Struct: '${candidate.name}', Recipient: ${recipientPhone.slice(0, 4)}***${recipientPhone.slice(-2)}`
            );

            const response = await axios.post(metaUrl, candidate.payload, {
              headers: {
                Authorization: `Bearer ${creds.accessToken}`,
                'Content-Type': 'application/json',
              },
              timeout: 10000,
            });

            if (response.data && (response.data.messages || response.status === 200)) {
              const messageId = response.data.messages?.[0]?.id || 'META_WA_OK';
              logger.info(
                `[META WHATSAPP OTP SUCCESS] Template '${tplName}' (${langCode}, ${candidate.name}) Message ID: ${messageId}`
              );
              successfulResult = {
                success: true,
                provider: 'META_CLOUD_API',
                templateUsed: tplName,
                languageUsed: langCode,
                structureUsed: candidate.name,
                messageId,
                phone: normalized,
              };
              break templateLoop;
            }
          } catch (err) {
            const metaCode = err.response?.data?.error?.code;
            const metaMsg = err.response?.data?.error?.message || err.message;
            lastErrorMsg = metaMsg;

            // If error is code 132000 / 132001 (Template not found / does not exist), skip to next language or template
            if (metaCode === 132001 || metaCode === 132000) {
              break; // Try next language or template
            }

            // If error is 190 (Invalid / expired OAuth access token), stop immediately
            if (metaCode === 190) {
              logger.error(`[META WHATSAPP AUTH ERROR] Access token is invalid or expired: ${metaMsg}`);
              return {
                success: false,
                error: `Meta Access Token authentication error: ${metaMsg}. Please refresh META_ACCESS_TOKEN in Render.`,
                provider: 'META_CLOUD_API',
              };
            }
          }
        }
      }
    }

    if (successfulResult) {
      return successfulResult;
    }

    logger.error(
      `[META WHATSAPP OTP FAILED] All template attempts failed. Last Meta error: ${lastErrorMsg}`
    );
    return {
      success: false,
      error: `Meta WhatsApp OTP dispatch failed: ${lastErrorMsg || 'Template rejected by Meta Cloud API'}. Verify template status in Meta WhatsApp Manager.`,
      provider: 'META_CLOUD_API',
    };
  } catch (error) {
    const metaErrMsg =
      error.response?.data?.error?.message || error.message || 'Failed to dispatch WhatsApp OTP';
    logger.error(`[META WHATSAPP OTP UNCAUGHT ERROR] ${metaErrMsg}`);
    return {
      success: false,
      error: metaErrMsg,
      provider: 'META_CLOUD_API',
    };
  }
};

module.exports = {
  normalizePhone,
  generate6DigitCode,
  hashOTP,
  getMetaCredentials,
  getMetaWhatsAppConfigStatus,
  sendOTPViaWhatsApp,
};
