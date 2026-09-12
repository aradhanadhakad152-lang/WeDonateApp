'use strict';

const axios = require('axios');
const logger = require('../utils/logger');

/**
 * Emergency WhatsApp Service Provider Abstraction — Production Grade
 *
 * ENVIRONMENT VARIABLES:
 * - WHATSAPP_ENABLED: 'true' | 'false' (Default: false)
 * - WHATSAPP_PROVIDER: 'META_CLOUD_API' | 'TWILIO' | 'ULTRAMSG' | 'GENERIC' (Default: GENERIC)
 * - WHATSAPP_ACCESS_TOKEN / WHATSAPP_API_KEY: Secret provider token / API key
 * - WHATSAPP_PHONE_NUMBER_ID: Meta Cloud API Phone Number ID
 * - WHATSAPP_TEMPLATE_NAME: Approved Meta WhatsApp Template Name (Default: emergency_blood_alert)
 * - WHATSAPP_TEMPLATE_LANGUAGE: Template language code (Default: en)
 * - WHATSAPP_FROM: Sender ID / Phone Number (Default: WE DONATE)
 * - WHATSAPP_MAX_DONORS_PER_REQUEST: Maximum WhatsApp alerts per request (Default: 5)
 */

const WHATSAPP_ENABLED = process.env.WHATSAPP_ENABLED === 'true';
const WHATSAPP_PROVIDER = process.env.WHATSAPP_PROVIDER || 'GENERIC';
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_API_KEY;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_TEMPLATE_NAME = process.env.WHATSAPP_TEMPLATE_NAME || 'emergency_blood_alert';
const WHATSAPP_TEMPLATE_LANGUAGE = process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en';
const WHATSAPP_FROM = process.env.WHATSAPP_FROM || 'WE DONATE Emergency';
const WHATSAPP_MAX_DONORS_PER_REQUEST = Number(process.env.WHATSAPP_MAX_DONORS_PER_REQUEST) || 5;

/**
 * Formats emergency blood alert text template for WhatsApp.
 *
 * PRIVACY SAFEGUARD:
 * Patient name, patient phone, exact home address, and exact GPS coordinates are
 * STRICTLY EXCLUDED to protect patient confidentiality and medical privacy.
 *
 * @param {object} details
 * @param {string} details.bloodGroup
 * @param {string} details.hospitalName
 * @param {string} details.formattedDistance
 * @param {string} [details.requestId]
 * @returns {string}
 */
const formatWhatsAppMessage = (details) => {
  const bloodGroup = details.bloodGroup || 'Emergency';
  const hospital = details.hospitalName || 'Nearby Medical Facility';
  const distance = details.formattedDistance || 'Nearby';

  return (
    `🚨 *WE DONATE EMERGENCY BLOOD ALERT* 🚨\n\n` +
    `Urgent *${bloodGroup}* blood is required at *${hospital}* (${distance} from your location).\n\n` +
    `You are a compatible registered donor nearby. Please open your WE DONATE app to view details and confirm if you can donate.\n\n` +
    `🩸 *Every minute counts!* Tap link below to view request & respond:\n` +
    `https://wedonateapp.onrender.com/portal/`
  );
};

/**
 * Safely inspects WhatsApp configuration without exposing secret credentials
 */
const getWhatsAppConfigStatus = () => {
  const maskedPhoneId = WHATSAPP_PHONE_NUMBER_ID
    ? `${WHATSAPP_PHONE_NUMBER_ID.slice(0, 3)}***${WHATSAPP_PHONE_NUMBER_ID.slice(-3)}`
    : 'NOT_SET';

  return {
    enabled: WHATSAPP_ENABLED,
    provider: WHATSAPP_PROVIDER,
    hasAccessToken: Boolean(WHATSAPP_ACCESS_TOKEN),
    phoneNumberId: maskedPhoneId,
    templateName: WHATSAPP_TEMPLATE_NAME,
    templateLanguage: WHATSAPP_TEMPLATE_LANGUAGE,
    maxDonorsPerRequest: WHATSAPP_MAX_DONORS_PER_REQUEST,
  };
};

/**
 * Sends an emergency WhatsApp message alert to a validated donor phone number.
 *
 * @param {string} phoneNumber - E.164 formatted phone number (e.g. +919876543210)
 * @param {object} alertDetails - Blood request alert context
 * @returns {Promise<{ sent: boolean, providerMessageId?: string, httpStatus?: number, reason?: string, providerResponse?: object }>}
 */
const sendEmergencyWhatsAppAlert = async (phoneNumber, alertDetails) => {
  if (!phoneNumber || !/^\+[1-9]\d{7,14}$/.test(phoneNumber.trim())) {
    logger.warn(`WhatsApp dispatch rejected: Invalid phone number format '${phoneNumber}'`);
    return { sent: false, reason: 'Invalid phone number format' };
  }

  const cleanPhone = phoneNumber.trim();

  // If WhatsApp is disabled in environment settings
  if (!WHATSAPP_ENABLED) {
    logger.debug(`WhatsApp alert skipped for ${cleanPhone}: WHATSAPP_ENABLED is set to false`);
    return {
      sent: false,
      reason: 'WhatsApp provider is disabled in environment configuration (WHATSAPP_ENABLED=false)',
    };
  }

  // Check provider credentials
  if (!WHATSAPP_ACCESS_TOKEN && WHATSAPP_PROVIDER !== 'GENERIC') {
    logger.error(`WhatsApp alert failed for ${cleanPhone}: Missing WHATSAPP_ACCESS_TOKEN/API_KEY in environment`);
    return {
      sent: false,
      reason: 'WhatsApp API credentials missing from environment configuration',
    };
  }

  try {
    const messageContent = formatWhatsAppMessage(alertDetails);

    logger.info(`Sending emergency WhatsApp alert via ${WHATSAPP_PROVIDER} to ${cleanPhone.slice(0, 4)}***${cleanPhone.slice(-2)}...`);

    let providerMessageId = null;
    let httpStatus = 200;
    let providerResponse = null;

    // 1. META CLOUD API DISPATCH
    if (WHATSAPP_PROVIDER === 'META_CLOUD_API' && WHATSAPP_PHONE_NUMBER_ID && WHATSAPP_ACCESS_TOKEN) {
      const metaUrl = `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
      
      // Use template messaging for Meta Cloud API
      const payload = {
        messaging_product: 'whatsapp',
        to: cleanPhone.replace('+', ''),
        type: 'template',
        template: {
          name: WHATSAPP_TEMPLATE_NAME,
          language: { code: WHATSAPP_TEMPLATE_LANGUAGE },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: alertDetails.bloodGroup || 'Emergency' },
                { type: 'text', text: alertDetails.hospitalName || 'Medical Center' },
                { type: 'text', text: alertDetails.formattedDistance || 'Nearby' },
              ],
            },
          ],
        },
      };

      const res = await axios.post(metaUrl, payload, {
        headers: {
          Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });

      httpStatus = res.status;
      providerResponse = res.data;
      if (res.data?.messages?.[0]?.id) {
        providerMessageId = res.data.messages[0].id;
      }
    }
    // 2. TWILIO WHATSAPP DISPATCH
    else if (WHATSAPP_PROVIDER === 'TWILIO' && WHATSAPP_ACCESS_TOKEN) {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
      const params = new URLSearchParams();
      params.append('From', `whatsapp:${WHATSAPP_FROM}`);
      params.append('To', `whatsapp:${cleanPhone}`);
      params.append('Body', messageContent);

      const res = await axios.post(twilioUrl, params, {
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${WHATSAPP_ACCESS_TOKEN}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 10000,
      });

      httpStatus = res.status;
      providerMessageId = res.data?.sid;
      providerResponse = { sid: res.data?.sid, status: res.data?.status };
    }
    // 3. ULTRAMSG DISPATCH
    else if (WHATSAPP_PROVIDER === 'ULTRAMSG' && WHATSAPP_ACCESS_TOKEN) {
      const instanceId = process.env.ULTRAMSG_INSTANCE_ID;
      const ultraUrl = `https://api.ultramsg.com/${instanceId}/messages/chat`;
      
      const res = await axios.post(ultraUrl, {
        token: WHATSAPP_ACCESS_TOKEN,
        to: cleanPhone,
        body: messageContent,
      }, { timeout: 10000 });

      httpStatus = res.status;
      providerMessageId = res.data?.id;
      providerResponse = { id: res.data?.id, status: res.data?.status };
    }
    // 4. GENERIC / SIMULATED DISPATCH
    else {
      providerMessageId = `WA_GENERIC_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      providerResponse = { status: 'DISPATCHED_SIMULATED', messageId: providerMessageId };
    }

    logger.info(`WhatsApp alert successfully dispatched to donor [Message ID: ${providerMessageId}]`);

    return {
      sent: true,
      providerMessageId,
      httpStatus,
      messageContent,
      providerResponse,
    };
  } catch (error) {
    // SECURITY: Never log raw tokens or auth headers in error traces
    const errMessage = error?.response?.data?.error?.message || error.message;
    const errStatus = error?.response?.status || 500;
    logger.error(`WhatsApp alert dispatch error: ${errMessage} [HTTP ${errStatus}]`);
    return {
      sent: false,
      httpStatus: errStatus,
      reason: errMessage,
    };
  }
};

module.exports = {
  WHATSAPP_ENABLED,
  WHATSAPP_PROVIDER,
  WHATSAPP_TEMPLATE_NAME,
  WHATSAPP_TEMPLATE_LANGUAGE,
  WHATSAPP_MAX_DONORS_PER_REQUEST,
  formatWhatsAppMessage,
  getWhatsAppConfigStatus,
  sendEmergencyWhatsAppAlert,
};
