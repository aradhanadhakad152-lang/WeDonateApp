'use strict';

const User = require('../models/User');
const BloodRequest = require('../models/BloodRequest');
const DonorMatch = require('../models/DonorMatch');
const { getCompatibleDonorGroups } = require('../utils/bloodCompatibility');
const { calculateDistanceKm, formatDistance } = require('../utils/distance');
const logger = require('../utils/logger');

/**
 * Donor Matching Engine Service — Production Grade
 *
 * Implements RBC blood group compatibility, MongoDB 2dsphere geospatial discovery,
 * Haversine distance ranking, duplicate prevention, and DonorMatch creation.
 */

const DEFAULT_RADIUS_KM = Number(process.env.DEFAULT_MATCHING_RADIUS_KM) || 10;
const EARTH_RADIUS_KM = 6378.1;

/**
 * Finds and assigns compatible nearby donors for an emergency BloodRequest.
 *
 * @param {string} requestId - BloodRequest ObjectId
 * @param {number} [radiusKmOverride] - Optional radius override in kilometers
 * @returns {Promise<{ matches: Array, newCount: number, existingCount: number, radiusKm: number }>}
 */
const findAndMatchNearbyDonors = async (requestId, radiusKmOverride) => {
  const radiusKm = Number(radiusKmOverride) || DEFAULT_RADIUS_KM;

  const bloodRequest = await BloodRequest.findById(requestId);
  if (!bloodRequest) {
    const err = new Error('Blood request not found');
    err.statusCode = 404;
    throw err;
  }

  if (['VERIFICATION_PENDING', 'REJECTED', 'CANCELLED', 'FULFILLED', 'EXPIRED'].includes(bloodRequest.status)) {
    const err = new Error(`Cannot run matching on a blood request with status '${bloodRequest.status}'`);
    err.statusCode = 400;
    throw err;
  }

  const [hospitalLng, hospitalLat] = bloodRequest.location.coordinates;
  if (!hospitalLat || !hospitalLng) {
    const err = new Error('Blood request does not have valid hospital coordinates');
    err.statusCode = 400;
    throw err;
  }

  // 1. Get compatible RBC donor blood groups
  const compatibleGroups = getCompatibleDonorGroups(bloodRequest.bloodGroup);

  // 2. MongoDB 2dsphere Geospatial Search
  const radiusInRadians = radiusKm / EARTH_RADIUS_KM;

  const query = {
    _id: { $ne: bloodRequest.requesterId }, // Exclude requester
    isActive: true,
    accountStatus: 'ACTIVE',
    isDonor: true,
    donorStatus: 'AVAILABLE',
    isEligible: true,
    bloodGroup: { $in: compatibleGroups },
    'location.coordinates': {
      $geoWithin: {
        $centerSphere: [[hospitalLng, hospitalLat], radiusInRadians],
      },
    },
  };

  const candidateDonors = await User.find(query).exec();

  // 3. Haversine Distance Calculation & Candidate Ranking
  const rankedCandidates = candidateDonors
    .map((donor) => {
      const donorLng = donor.location.coordinates[0];
      const donorLat = donor.location.coordinates[1];

      // Ignore donors with invalid [0,0] coordinates
      if (!donorLat || !donorLng || (donorLat === 0 && donorLng === 0)) {
        return null;
      }

      const distanceKm = calculateDistanceKm(hospitalLat, hospitalLng, donorLat, donorLng);
      return {
        donor,
        distanceKm,
      };
    })
    .filter((c) => c !== null && c.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm); // Nearest first ranking

  // 4. Fetch existing matches to prevent duplicates
  const existingMatches = await DonorMatch.find({ bloodRequest: bloodRequest._id }).exec();
  const matchedDonorIds = new Set(existingMatches.map((m) => m.donor.toString()));

  const newMatchesToCreate = [];
  const resultingMatches = [...existingMatches];

  // 5. Create DonorMatch records for new candidates
  for (const candidate of rankedCandidates) {
    const donorIdStr = candidate.donor._id.toString();

    if (!matchedDonorIds.has(donorIdStr)) {
      newMatchesToCreate.push({
        bloodRequest: bloodRequest._id,
        donor: candidate.donor._id,
        requester: bloodRequest.requesterId,
        donorBloodGroup: candidate.donor.bloodGroup,
        requestedBloodGroup: bloodRequest.bloodGroup,
        distanceKm: candidate.distanceKm,
        donorLocation: {
          type: 'Point',
          coordinates: [candidate.donor.location.coordinates[0], candidate.donor.location.coordinates[1]],
        },
        status: 'PENDING',
        expiresAt: bloodRequest.requiredBy || new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
    }
  }

  let createdMatches = [];
  if (newMatchesToCreate.length > 0) {
    try {
      createdMatches = await DonorMatch.insertMany(newMatchesToCreate, { ordered: false });
      resultingMatches.push(...createdMatches);
    } catch (insertError) {
      // Gracefully handle any race condition duplicate key errors
      logger.warn(`Duplicate key encountered during match insertion: ${insertError.message}`);
    }
  }

  // 6. Update BloodRequest status to MATCHING if matches exist
  if (resultingMatches.length > 0 && ['OPEN', 'HOSPITAL_VERIFIED', 'ADMIN_VERIFIED'].includes(bloodRequest.status)) {
    bloodRequest.status = 'MATCHING';
    await bloodRequest.save();
  }

  // 7. Multi-Channel Notification Integration: Trigger FCM Push & WhatsApp Alerts
  if (createdMatches.length > 0) {
    try {
      const { sendNotificationToUser } = require('./notificationService');
      const { sendEmergencySMS, SMS_MAX_DONORS_PER_REQUEST } = require('./smsService');
      const { sendEmergencyWhatsAppAlert, WHATSAPP_MAX_DONORS_PER_REQUEST } = require('./whatsappService');

      let smsCount = 0;
      let whatsappCount = 0;

      for (const m of createdMatches) {
        const formattedDist = m.distanceKm < 1 ? `${Math.round(m.distanceKm * 1000)} m` : `${m.distanceKm.toFixed(1)} km`;

        // 1. Send FCM Push Notification to Donor App
        await sendNotificationToUser(
          m.donor,
          'BLOOD_REQUEST',
          '🚨 Emergency Blood Alert',
          `Urgent ${bloodRequest.bloodGroup} blood needed ${formattedDist} from your location at ${bloodRequest.hospitalName}.`,
          { bloodGroup: bloodRequest.bloodGroup, distanceKm: String(m.distanceKm) },
          bloodRequest._id,
          m._id
        );

        const donorUser = candidateDonors.find((d) => d._id.toString() === m.donor.toString());

        // 2. Send Emergency WhatsApp Alert to Same Matched Donors
        if (donorUser && donorUser.phone && whatsappCount < WHATSAPP_MAX_DONORS_PER_REQUEST) {
          await sendEmergencyWhatsAppAlert(donorUser.phone, {
            bloodGroup: bloodRequest.bloodGroup,
            patientName: bloodRequest.patientName,
            hospitalName: bloodRequest.hospitalName,
            formattedDistance: formattedDist,
            requestId: String(bloodRequest._id),
            matchId: String(m._id),
          });
          whatsappCount++;
        }

        // 3. Send Emergency SMS Alert (Fallback / supplementary alert)
        if (donorUser && donorUser.phone && smsCount < SMS_MAX_DONORS_PER_REQUEST) {
          await sendEmergencySMS(
            donorUser.phone,
            `WE DONATE Emergency Alert: ${bloodRequest.bloodGroup} blood is urgently required near your location. Open WeDonate app to view request.`
          );
          smsCount++;
        }
      }
    } catch (notifErr) {
      logger.error(`Notification trigger error during matching: ${notifErr.message}`);
    }
  }

  logger.info(`Donor Matching completed for request ${requestId}: found ${rankedCandidates.length} candidate(s), created ${createdMatches.length} new match(es) within ${radiusKm}km`);

  return {
    requestId: bloodRequest._id,
    matches: resultingMatches,
    newCount: createdMatches.length,
    existingCount: existingMatches.length,
    totalCount: resultingMatches.length,
    radiusKm,
  };
};

module.exports = {
  DEFAULT_RADIUS_KM,
  findAndMatchNearbyDonors,
};
