'use strict';

const BloodRequest = require('../models/BloodRequest');
const DonorMatch = require('../models/DonorMatch');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { sendNotificationToUser } = require('./notificationService');
const { sendEmergencyWhatsAppAlert, getWhatsAppConfigStatus } = require('./whatsappService');
const { sendEmergencySMS } = require('./smsService');
const logger = require('../utils/logger');

const DEFAULT_BATCH_SIZE = Number(process.env.DONOR_NOTIFICATION_BATCH_SIZE) || 5;
const DEFAULT_RESPONSE_WINDOW_MINUTES = Number(process.env.DONOR_NOTIFICATION_RESPONSE_WINDOW_MINUTES) || 10;

/**
 * Dispatches the next batch of emergency notifications for a verified BloodRequest.
 *
 * @param {string|ObjectId} requestId - BloodRequest ObjectId
 * @param {object} [options={}]
 * @param {boolean} [options.forceNext=false] - Force next batch dispatch
 * @returns {Promise<object>} Campaign status and dispatch summary
 */
const dispatchNotificationBatchForRequest = async (requestId, options = {}) => {
  const bloodRequest = await BloodRequest.findById(requestId);
  if (!bloodRequest) {
    throw new Error(`Blood request ${requestId} not found`);
  }

  // 1. Check Stop Conditions
  const terminalStatuses = ['FULFILLED', 'CANCELLED', 'EXPIRED', 'REJECTED'];
  if (terminalStatuses.includes(bloodRequest.status)) {
    if (!bloodRequest.notificationCampaign?.isStopped) {
      bloodRequest.notificationCampaign = bloodRequest.notificationCampaign || {};
      bloodRequest.notificationCampaign.isStopped = true;
      bloodRequest.notificationCampaign.stopReason = `Request reached terminal state: ${bloodRequest.status}`;
      await bloodRequest.save();
    }
    return {
      requestId: bloodRequest._id,
      dispatched: false,
      reason: `Request is in terminal state '${bloodRequest.status}'`,
    };
  }

  // Stop if donor has accepted
  if (bloodRequest.acceptedDonorId || ['ACCEPTED', 'DONOR_RESPONDED', 'DONOR_CONFIRMED'].includes(bloodRequest.status)) {
    if (!bloodRequest.notificationCampaign?.isStopped) {
      bloodRequest.notificationCampaign = bloodRequest.notificationCampaign || {};
      bloodRequest.notificationCampaign.isStopped = true;
      bloodRequest.notificationCampaign.stopReason = 'DONOR_ACCEPTED';
      await bloodRequest.save();
    }
    return {
      requestId: bloodRequest._id,
      dispatched: false,
      reason: 'A donor has already accepted this request. Notification campaign stopped.',
    };
  }

  // Stop if campaign was manually stopped
  if (bloodRequest.notificationCampaign?.isStopped) {
    return {
      requestId: bloodRequest._id,
      dispatched: false,
      reason: `Campaign is stopped: ${bloodRequest.notificationCampaign.stopReason || 'Manual stop'}`,
    };
  }

  // 2. Fetch all candidate DonorMatch records for this request ordered by distance
  const allMatches = await DonorMatch.find({ bloodRequest: bloodRequest._id })
    .populate('donor')
    .sort({ distanceKm: 1 })
    .exec();

  if (allMatches.length === 0) {
    return {
      requestId: bloodRequest._id,
      dispatched: false,
      reason: 'No matched candidate donors available in system',
    };
  }

  // Filter pending candidates who have not been notified yet
  const unNotifiedMatches = allMatches.filter((m) => m.status === 'PENDING');

  if (unNotifiedMatches.length === 0) {
    logger.info(`All ${allMatches.length} matched donor(s) have already been notified for BloodRequest ${bloodRequest._id}`);
    bloodRequest.notificationCampaign = bloodRequest.notificationCampaign || {};
    bloodRequest.notificationCampaign.nextBatchScheduledAt = null;
    await bloodRequest.save();
    return {
      requestId: bloodRequest._id,
      dispatched: false,
      allNotified: true,
      reason: 'All matched candidate donors have already been notified',
    };
  }

  // 3. Determine Batch Size & Candidates
  const batchSize = Number(process.env.DONOR_NOTIFICATION_BATCH_SIZE) || bloodRequest.notificationCampaign?.batchSize || DEFAULT_BATCH_SIZE;
  const responseWindowMinutes = Number(process.env.DONOR_NOTIFICATION_RESPONSE_WINDOW_MINUTES) || bloodRequest.notificationCampaign?.responseWindowMinutes || DEFAULT_RESPONSE_WINDOW_MINUTES;

  const currentBatchCandidates = unNotifiedMatches.slice(0, batchSize);
  const currentBatchIndex = ((bloodRequest.notificationCampaign?.currentBatchIndex) || 0) + 1;

  let fcmCount = 0;
  let whatsAppCount = 0;
  let smsCount = 0;

  const whatsappConfig = getWhatsAppConfigStatus();

  // 4. Dispatch Multi-Channel Notifications for Candidates in Current Batch
  for (const match of currentBatchCandidates) {
    const donor = match.donor;
    if (!donor || donor.accountStatus !== 'ACTIVE' || !donor.isActive) {
      continue;
    }

    const formattedDist = match.distanceKm < 1 ? `${Math.round(match.distanceKm * 1000)} m` : `${match.distanceKm.toFixed(1)} km`;
    const prefs = donor.notificationPreferences || { emergencyFCM: true, emergencyWhatsApp: true, emergencySMS: true };

    // --- CHANNEL 1: FCM PUSH NOTIFICATION ---
    if (prefs.emergencyFCM !== false) {
      try {
        const title = '🚨 Emergency Blood Alert';
        const body = `Urgent ${bloodRequest.bloodGroup} blood needed ${formattedDist} from your location at ${bloodRequest.hospitalName}.`;
        
        const fcmNotif = await sendNotificationToUser(
          donor._id,
          'BLOOD_REQUEST',
          title,
          body,
          { bloodGroup: bloodRequest.bloodGroup, distanceKm: String(match.distanceKm) },
          bloodRequest._id,
          match._id
        );

        if (fcmNotif) {
          fcmNotif.batchIndex = currentBatchIndex;
          fcmNotif.channel = 'FCM';
          await fcmNotif.save();
          if (['SENT', 'DISPATCHED', 'DELIVERED', 'SIMULATED'].includes(fcmNotif.status)) {
            fcmCount++;
          }
        }
      } catch (fcmErr) {
        logger.error(`FCM batch dispatch error for donor ${donor._id}: ${fcmErr.message}`);
      }
    }

    // --- CHANNEL 2: EMERGENCY WHATSAPP ALERT ---
    if (prefs.emergencyWhatsApp !== false && donor.phone) {
      try {
        const waResult = await sendEmergencyWhatsAppAlert(donor.phone, {
          bloodGroup: bloodRequest.bloodGroup,
          hospitalName: bloodRequest.hospitalName,
          formattedDistance: formattedDist,
          requestId: String(bloodRequest._id),
          matchId: String(match._id),
        });

        let waStatus = 'FAILED';
        if (waResult.sent) {
          waStatus = waResult.providerResponse?.status === 'DISPATCHED_SIMULATED' ? 'SIMULATED' : 'DISPATCHED';
          whatsAppCount++;
        } else if (!whatsappConfig.enabled || waResult.reason?.includes('disabled')) {
          waStatus = 'NOT_CONFIGURED';
        }

        await Notification.create({
          user: donor._id,
          bloodRequest: bloodRequest._id,
          donorMatch: match._id,
          type: 'BLOOD_REQUEST',
          title: '🚨 Emergency WhatsApp Alert',
          body: `Emergency ${bloodRequest.bloodGroup} blood required at ${bloodRequest.hospitalName}`,
          channel: 'WHATSAPP',
          batchIndex: currentBatchIndex,
          status: waStatus,
          sentAt: waResult.sent ? new Date() : null,
          providerMessageId: waResult.providerMessageId || null,
          providerResponse: waResult.providerResponse || null,
          error: waResult.sent ? null : waResult.reason,
        });
      } catch (waErr) {
        logger.error(`WhatsApp batch dispatch error for donor ${donor._id}: ${waErr.message}`);
      }
    }

    // --- CHANNEL 3: SMS FALLBACK ALERT ---
    if (prefs.emergencySMS !== false && donor.phone) {
      try {
        const smsResult = await sendEmergencySMS(
          donor.phone,
          `WE DONATE Emergency Alert: ${bloodRequest.bloodGroup} blood required near your location. Open WeDonate app to view request.`
        );

        let smsStatus = smsResult.success ? 'DISPATCHED' : 'FAILED';
        if (smsResult.success) smsCount++;

        await Notification.create({
          user: donor._id,
          bloodRequest: bloodRequest._id,
          donorMatch: match._id,
          type: 'BLOOD_REQUEST',
          title: '🚨 Emergency SMS Alert',
          body: `Emergency ${bloodRequest.bloodGroup} blood required near your location`,
          channel: 'SMS',
          batchIndex: currentBatchIndex,
          status: smsStatus,
          sentAt: smsResult.success ? new Date() : null,
          error: smsResult.success ? null : smsResult.error,
        });
      } catch (smsErr) {
        logger.error(`SMS batch dispatch error for donor ${donor._id}: ${smsErr.message}`);
      }
    }

    // Mark DonorMatch status as NOTIFIED
    match.status = 'NOTIFIED';
    await match.save();
  }

  // 5. Update Campaign Metrics on BloodRequest
  const now = new Date();
  const nextScheduled = new Date(now.getTime() + responseWindowMinutes * 60 * 1000);

  if (!bloodRequest.notificationCampaign) {
    bloodRequest.notificationCampaign = {};
  }
  bloodRequest.notificationCampaign.currentBatchIndex = currentBatchIndex;
  bloodRequest.notificationCampaign.batchSize = batchSize;
  bloodRequest.notificationCampaign.responseWindowMinutes = responseWindowMinutes;
  bloodRequest.notificationCampaign.lastBatchDispatchedAt = now;
  bloodRequest.notificationCampaign.totalMatchedDonors = allMatches.length;
  bloodRequest.notificationCampaign.totalNotifiedDonors = (bloodRequest.notificationCampaign.totalNotifiedDonors || 0) + currentBatchCandidates.length;
  bloodRequest.notificationCampaign.fcmDispatchedCount = (bloodRequest.notificationCampaign.fcmDispatchedCount || 0) + fcmCount;
  bloodRequest.notificationCampaign.whatsAppDispatchedCount = (bloodRequest.notificationCampaign.whatsAppDispatchedCount || 0) + whatsAppCount;
  bloodRequest.notificationCampaign.smsDispatchedCount = (bloodRequest.notificationCampaign.smsDispatchedCount || 0) + smsCount;

  // Schedule next batch if remaining unnotified candidates exist
  const remainingCount = unNotifiedMatches.length - currentBatchCandidates.length;
  bloodRequest.notificationCampaign.nextBatchScheduledAt = remainingCount > 0 ? nextScheduled : null;

  if (['OPEN', 'HOSPITAL_VERIFIED', 'ADMIN_VERIFIED'].includes(bloodRequest.status)) {
    bloodRequest.status = 'MATCHING';
  }

  await bloodRequest.save();

  logger.info(`Notification Batch ${currentBatchIndex} dispatched for BloodRequest ${bloodRequest._id}: ${currentBatchCandidates.length} donor(s) notified (FCM: ${fcmCount}, WA: ${whatsAppCount}, SMS: ${smsCount}). Next batch in ${responseWindowMinutes}m`);

  return {
    requestId: bloodRequest._id,
    dispatched: true,
    batchIndex: currentBatchIndex,
    batchSize: currentBatchCandidates.length,
    fcmCount,
    whatsAppCount,
    smsCount,
    remainingUnnotified: remainingCount,
    nextBatchScheduledAt: bloodRequest.notificationCampaign.nextBatchScheduledAt,
  };
};

/**
 * Periodically processes active campaigns whose response window timer has elapsed.
 */
const processPendingNotificationBatches = async () => {
  try {
    const activeRequests = await BloodRequest.find({
      status: { $in: ['MATCHING', 'HOSPITAL_VERIFIED', 'ADMIN_VERIFIED'] },
      acceptedDonorId: null,
      'notificationCampaign.isStopped': false,
      'notificationCampaign.nextBatchScheduledAt': { $lte: new Date() },
    });

    for (const reqRecord of activeRequests) {
      try {
        await dispatchNotificationBatchForRequest(reqRecord._id);
      } catch (err) {
        logger.error(`Error processing batch for BloodRequest ${reqRecord._id}: ${err.message}`);
      }
    }
  } catch (error) {
    logger.error(`Error in processPendingNotificationBatches worker: ${error.message}`);
  }
};

/**
 * Manually stops an active notification campaign.
 */
const stopNotificationCampaign = async (requestId, reason = 'Manually stopped by operator') => {
  const bloodRequest = await BloodRequest.findById(requestId);
  if (!bloodRequest) throw new Error('Blood request not found');

  if (!bloodRequest.notificationCampaign) {
    bloodRequest.notificationCampaign = {};
  }
  bloodRequest.notificationCampaign.isStopped = true;
  bloodRequest.notificationCampaign.stopReason = reason;
  bloodRequest.notificationCampaign.nextBatchScheduledAt = null;
  await bloodRequest.save();

  logger.info(`Notification campaign manually stopped for BloodRequest ${requestId}: ${reason}`);
  return bloodRequest.notificationCampaign;
};

module.exports = {
  dispatchNotificationBatchForRequest,
  processPendingNotificationBatches,
  stopNotificationCampaign,
};
