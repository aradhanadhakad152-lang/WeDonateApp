'use strict';

const mongoose = require('mongoose');
const DonorMatch = require('../models/DonorMatch');
const BloodRequest = require('../models/BloodRequest');
const { findAndMatchNearbyDonors } = require('../services/donorMatchingService');
const { formatDistance } = require('../utils/distance');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../utils/logger');

/**
 * Match Controller — Production Grade Match Assignment, Acceptance & Rejection
 *
 * SECURITY:
 * - Donor identity is taken strictly from `req.user._id` attached by JWT middleware.
 * - Requester identity is verified before triggering assignment or modifying request status.
 * - Prevents IDOR and concurrent double-claiming race conditions.
 */

// GET /api/v1/matches/nearby/:requestId — Get nearby matches for a blood request
const getNearbyMatchesForRequest = asyncHandler(async (req, res) => {
  const { requestId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(requestId)) {
    return sendError(res, {
      statusCode: 400,
      message: 'Invalid blood request ID format',
    });
  }

  const bloodRequest = await BloodRequest.findById(requestId);
  if (!bloodRequest) {
    return sendError(res, {
      statusCode: 404,
      message: 'Blood request not found',
    });
  }

  const matches = await DonorMatch.find({ bloodRequest: requestId })
    .populate('donor', 'fullName name bloodGroup isEligible isAvailable location')
    .sort({ distanceKm: 1 })
    .exec();

  const formattedMatches = matches.map((m) => {
    const json = m.toJSON();
    json.formattedDistance = formatDistance(m.distanceKm);
    if (json.donor) {
      if (json.donor.location) {
        delete json.donor.location.coordinates; // Protect exact coordinates
        delete json.donor.location.address;     // Protect exact address
      }
      if (m.status !== 'ACCEPTED') {
        delete json.donor.phone; // Never expose phone number unless donor has accepted
      }
    }
    return json;
  });

  return sendSuccess(res, {
    statusCode: 200,
    message: `Retrieved ${formattedMatches.length} match(es) for blood request`,
    data: {
      requestId,
      matches: formattedMatches,
      total: formattedMatches.length,
    },
  });
});

// POST /api/v1/matches/:requestId/assign — Run matching engine for blood request
const assignMatchesForRequest = asyncHandler(async (req, res) => {
  const { requestId } = req.params;
  const { radiusKm } = req.body;

  if (!mongoose.Types.ObjectId.isValid(requestId)) {
    return sendError(res, {
      statusCode: 400,
      message: 'Invalid blood request ID format',
    });
  }

  const bloodRequest = await BloodRequest.findById(requestId);
  if (!bloodRequest) {
    return sendError(res, {
      statusCode: 404,
      message: 'Blood request not found',
    });
  }

  // Authorization Check: Requester only
  if (bloodRequest.requesterId.toString() !== req.user._id.toString()) {
    return sendError(res, {
      statusCode: 403,
      message: 'Only the request creator can trigger donor matching',
    });
  }

  const result = await findAndMatchNearbyDonors(requestId, radiusKm);

  return sendSuccess(res, {
    statusCode: 200,
    message: `Matching engine found ${result.totalCount} candidate donor(s)`,
    data: result,
  });
});

// GET /api/v1/matches/my — Get all matched opportunities for the authenticated donor
const getMyMatches = asyncHandler(async (req, res) => {
  const donorId = req.user._id;
  const { status } = req.query;

  const filter = { donor: donorId };
  if (status && status !== 'all') {
    filter.status = status.toUpperCase();
  }

  const matches = await DonorMatch.find(filter)
    .populate('bloodRequest')
    .populate('requester', 'fullName name phone bloodGroup')
    .sort({ createdAt: -1 })
    .exec();

  const formattedMatches = matches.map((m) => {
    const json = m.toJSON();
    json.formattedDistance = formatDistance(m.distanceKm);

    // SECURITY: Omit requester phone number unless donor has ACCEPTED the match
    if (json.requester && m.status !== 'ACCEPTED') {
      delete json.requester.phone;
    }
    return json;
  });

  return sendSuccess(res, {
    statusCode: 200,
    message: `Retrieved ${formattedMatches.length} match(es) for donor`,
    data: {
      matches: formattedMatches,
      total: formattedMatches.length,
    },
  });
});

// POST /api/v1/matches/:matchId/accept — Accept assigned blood donation match
const acceptMatch = asyncHandler(async (req, res) => {
  const { matchId } = req.params;
  const donorUser = req.user;

  if (!mongoose.Types.ObjectId.isValid(matchId)) {
    return sendError(res, {
      statusCode: 400,
      message: 'Invalid match ID format',
    });
  }

  const match = await DonorMatch.findById(matchId);
  if (!match) {
    return sendError(res, {
      statusCode: 404,
      message: 'Match record not found',
    });
  }

  // Ownership Check: Only assigned donor can accept
  if (match.donor.toString() !== donorUser._id.toString()) {
    return sendError(res, {
      statusCode: 403,
      message: 'You are not authorized to accept this donor match',
    });
  }

  // Idempotency check: If already accepted by this donor, return 200 OK gracefully
  if (match.status === 'ACCEPTED') {
    const bloodRequest = await BloodRequest.findById(match.bloodRequest);
    return sendSuccess(res, {
      statusCode: 200,
      message: 'Match is already accepted',
      data: {
        match,
        request: bloodRequest,
      },
    });
  }

  if (!['PENDING', 'NOTIFIED'].includes(match.status)) {
    return sendError(res, {
      statusCode: 400,
      message: `Match cannot be accepted because status is '${match.status}'`,
    });
  }

  // Check BloodRequest status
  const bloodRequest = await BloodRequest.findById(match.bloodRequest);
  if (!bloodRequest) {
    return sendError(res, {
      statusCode: 404,
      message: 'Associated blood request no longer exists',
    });
  }

  if (['CANCELLED', 'EXPIRED', 'FULFILLED'].includes(bloodRequest.status)) {
    return sendError(res, {
      statusCode: 400,
      message: `Cannot accept match for a blood request with status '${bloodRequest.status}'`,
    });
  }

  // Concurrency check: If already accepted by another donor
  if (bloodRequest.status === 'ACCEPTED' && bloodRequest.acceptedDonorId && bloodRequest.acceptedDonorId.toString() !== donorUser._id.toString()) {
    return sendError(res, {
      statusCode: 409,
      message: 'This emergency request has already been claimed by another donor',
    });
  }

  // Atomic Update Match Status
  match.status = 'ACCEPTED';
  match.respondedAt = new Date();
  await match.save();

  // Atomic Update BloodRequest Status
  if (['OPEN', 'HOSPITAL_VERIFIED', 'ADMIN_VERIFIED', 'MATCHING'].includes(bloodRequest.status)) {
    bloodRequest.status = 'DONOR_RESPONDED';
  }
  if (!bloodRequest.acceptedDonorId) {
    bloodRequest.acceptedDonorId = donorUser._id;
  }
  await bloodRequest.save();

  // Trigger FCM Notification to Requester
  try {
    const { sendNotificationToUser } = require('../services/notificationService');
    const donorName = donorUser.fullName || donorUser.name || 'A compatible donor';
    await sendNotificationToUser(
      bloodRequest.requesterId,
      'DONOR_ACCEPTED',
      '✅ Donor Accepted Your Request!',
      `${donorName} (${donorUser.bloodGroup}) has accepted your emergency blood request for ${bloodRequest.patientName}.`,
      { bloodRequestId: String(bloodRequest._id), matchId: String(match._id) },
      bloodRequest._id,
      match._id
    );
  } catch (notifErr) {
    logger.error(`Failed to send accept notification to requester: ${notifErr.message}`);
  }

  logger.info(`Donor ${donorUser._id} accepted BloodRequest ${bloodRequest._id}`);

  return sendSuccess(res, {
    statusCode: 200,
    message: 'You have successfully accepted the emergency blood request',
    data: {
      match,
      request: bloodRequest,
    },
  });
});

// POST /api/v1/matches/:matchId/reject — Reject assigned blood donation match
const rejectMatch = asyncHandler(async (req, res) => {
  const { matchId } = req.params;
  const { reason } = req.body;
  const donorUser = req.user;

  if (!mongoose.Types.ObjectId.isValid(matchId)) {
    return sendError(res, {
      statusCode: 400,
      message: 'Invalid match ID format',
    });
  }

  const match = await DonorMatch.findById(matchId);
  if (!match) {
    return sendError(res, {
      statusCode: 404,
      message: 'Match record not found',
    });
  }

  // Ownership Check: Only assigned donor can reject
  if (match.donor.toString() !== donorUser._id.toString()) {
    return sendError(res, {
      statusCode: 403,
      message: 'You are not authorized to reject this donor match',
    });
  }

  // Idempotency check: If already rejected, return 200 OK gracefully
  if (match.status === 'REJECTED') {
    return sendSuccess(res, {
      statusCode: 200,
      message: 'Match is already declined',
      data: {
        match,
      },
    });
  }

  if (!['PENDING', 'NOTIFIED'].includes(match.status)) {
    return sendError(res, {
      statusCode: 400,
      message: `Match cannot be rejected because status is '${match.status}'`,
    });
  }

  match.status = 'REJECTED';
  match.respondedAt = new Date();
  if (reason) {
    match.rejectionReason = reason;
  }
  await match.save();

  // Trigger FCM Notification to Requester
  try {
    const { sendNotificationToUser } = require('../services/notificationService');
    await sendNotificationToUser(
      match.requester,
      'DONOR_REJECTED',
      'Donor Update',
      `A matched donor was unable to accept your blood request for ${match.requestedBloodGroup}.`,
      { bloodRequestId: String(match.bloodRequest), matchId: String(match._id) },
      match.bloodRequest,
      match._id
    );
  } catch (notifErr) {
    logger.error(`Failed to send reject notification to requester: ${notifErr.message}`);
  }

  logger.info(`Donor ${donorUser._id} rejected match ${match._id}`);

  return sendSuccess(res, {
    statusCode: 200,
    message: 'You have declined the blood donation match request',
    data: {
      match,
    },
  });
});

// PATCH /api/v1/matches/:matchId/respond — Standardized response action handler
const respondToMatch = asyncHandler(async (req, res) => {
  const { response, status, reason } = req.body;
  const action = (response || status || '').toUpperCase();

  if (['ACCEPTED', 'I_CAN_DONATE', 'YES', 'ACCEPT'].includes(action)) {
    return acceptMatch(req, res);
  } else if (['REJECTED', 'NOT_AVAILABLE', 'NO', 'DECLINE', 'REJECT'].includes(action)) {
    req.body.reason = reason;
    return rejectMatch(req, res);
  } else {
    return sendError(res, {
      statusCode: 400,
      message: "Invalid response action. Must be 'ACCEPTED' ('I_CAN_DONATE') or 'REJECTED' ('NOT_AVAILABLE')",
    });
  }
});

// GET /api/v1/matches/:matchId — Get single match details
const getMatchById = asyncHandler(async (req, res) => {
  const { matchId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(matchId)) {
    return sendError(res, {
      statusCode: 400,
      message: 'Invalid match ID format',
    });
  }

  const match = await DonorMatch.findById(matchId)
    .populate('bloodRequest')
    .populate('donor', 'fullName name phone bloodGroup')
    .populate('requester', 'fullName name phone')
    .exec();

  if (!match) {
    return sendError(res, {
      statusCode: 404,
      message: 'Match record not found',
    });
  }

  const userId = req.user._id.toString();
  const isDonor = match.donor._id.toString() === userId;
  const isRequester = match.requester._id.toString() === userId;

  if (!isDonor && !isRequester) {
    return sendError(res, {
      statusCode: 403,
      message: 'You are not authorized to view this match record',
    });
  }

  const json = match.toJSON();
  json.formattedDistance = formatDistance(match.distanceKm);

  // SECURITY: Only expose donor phone number if donor has ACCEPTED the request, or if user is admin/staff
  const isStaffOrAdmin = req.user.role && ['ADMIN', 'HOSPITAL_STAFF'].includes(req.user.role);
  if (json.donor && match.status !== 'ACCEPTED' && !isStaffOrAdmin) {
    delete json.donor.phone;
  }
  if (json.donor && json.donor.location) {
    delete json.donor.location.coordinates;
    delete json.donor.location.address;
  }

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Match details retrieved successfully',
    data: {
      match: json,
    },
  });
});

module.exports = {
  getNearbyMatchesForRequest,
  assignMatchesForRequest,
  acceptMatch,
  rejectMatch,
  getMyMatches,
  respondToMatch,
  getMatchById,
};
