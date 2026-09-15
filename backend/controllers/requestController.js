'use strict';

const mongoose = require('mongoose');
const BloodRequest = require('../models/BloodRequest');
const DonorMatch = require('../models/DonorMatch');
const { validateStatusTransition, evaluateRequestExpiration } = require('../services/bloodRequestService');
const { getCompatibleRecipientGroups } = require('../utils/bloodCompatibility');
const { calculateDistanceKm, formatDistance } = require('../utils/distance');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../utils/logger');

/**
 * Request Controller — Production Grade Blood Request Management
 *
 * SECURITY:
 * - requesterId is strictly derived from the authenticated JWT user (req.user._id).
 * - Client cannot spoof requesterId, status, or lifecycle timestamps.
 * - Authorization checks prevent non-creators from editing or cancelling requests.
 */

// POST /api/v1/blood-requests — Create a new emergency blood request
const createRequest = asyncHandler(async (req, res) => {
  const user = req.user;
  const {
    patientName,
    bloodGroup,
    unitsRequired,
    hospitalName,
    hospitalAddress,
    hospitalLatitude,
    hospitalLongitude,
    targetOrganizationId,
    urgency,
    requiredBy,
    reason,
    contactPhone,
    additionalNotes,
  } = req.body;

  const lat = Number(hospitalLatitude);
  const lng = Number(hospitalLongitude);

  // Validate targetOrganizationId if provided
  let validTargetOrgId = null;
  if (targetOrganizationId) {
    if (!mongoose.Types.ObjectId.isValid(targetOrganizationId)) {
      return sendError(res, {
        statusCode: 400,
        message: 'Invalid target organization ID format',
      });
    }
    const Organization = require('../models/Organization');
    const org = await Organization.findById(targetOrganizationId);
    if (!org) {
      return sendError(res, {
        statusCode: 404,
        message: 'Target organization not found',
      });
    }
    validTargetOrgId = org._id;
  }

  // SECURITY & BUSINESS RULE: Prevent multiple active blood requests per user
  const activeStatuses = [
    'OPEN',
    'MATCHING',
    'ACCEPTED',
    'VERIFICATION_PENDING',
    'HOSPITAL_VERIFIED',
    'ADMIN_VERIFIED',
    'DONOR_RESPONDED',
    'DONOR_CONFIRMED',
  ];

  const existingActiveRequest = await BloodRequest.findOne({
    requesterId: user._id,
    status: { $in: activeStatuses },
  }).sort({ createdAt: -1 });

  if (existingActiveRequest) {
    logger.warn(`User ${user._id} attempted to create duplicate active blood request while request ${existingActiveRequest._id} is active (${existingActiveRequest.status}).`);
    return res.status(400).json({
      success: false,
      message: 'You already have an active blood request.',
      existingRequest: existingActiveRequest,
      existingRequestId: existingActiveRequest._id.toString(),
      data: {
        existingRequest: existingActiveRequest,
        existingRequestId: existingActiveRequest._id.toString(),
        request: existingActiveRequest,
      },
      timestamp: new Date().toISOString(),
    });
  }

  const bloodRequest = new BloodRequest({
    requesterId: user._id,
    patientName,
    bloodGroup,
    unitsRequired,
    hospitalName,
    hospitalAddress,
    hospitalLatitude: lat,
    hospitalLongitude: lng,
    location: {
      type: 'Point',
      coordinates: [lng, lat], // GeoJSON order: [longitude, latitude]
    },
    targetOrganizationId: validTargetOrgId,
    urgency: urgency || 'NORMAL',
    requiredBy: requiredBy ? new Date(requiredBy) : undefined,
    reason,
    contactPhone,
    additionalNotes,
    status: 'VERIFICATION_PENDING',
  });

  await bloodRequest.save();

  logger.info(`Emergency BloodRequest created: ${bloodRequest._id} by user: ${user._id} (${bloodGroup}, ${unitsRequired} units)`);

  return sendSuccess(res, {
    statusCode: 201,
    message: 'Emergency blood request created successfully',
    data: {
      request: bloodRequest,
    },
  });
});

// GET /api/v1/blood-requests — List all active blood requests (with filters)
const getAllRequests = asyncHandler(async (req, res) => {
  const { status, bloodGroup, urgency } = req.query;

  const queryFilter = {};

  if (status) {
    queryFilter.status = status;
  } else {
    // Default to active requests if status filter not specified
    queryFilter.status = { $in: ['OPEN', 'MATCHING', 'ACCEPTED', 'VERIFICATION_PENDING', 'DONOR_RESPONDED'] };
  }

  if (bloodGroup) {
    queryFilter.bloodGroup = bloodGroup;
  }

  if (urgency) {
    queryFilter.urgency = urgency;
  }

  const requests = await BloodRequest.find(queryFilter)
    .populate('requesterId', 'fullName name phone bloodGroup')
    .sort({ createdAt: -1 })
    .exec();

  // Evaluate expiration for each request
  let hasChanges = false;
  for (const reqDoc of requests) {
    if (evaluateRequestExpiration(reqDoc)) {
      await reqDoc.save();
      hasChanges = true;
    }
  }

  return sendSuccess(res, {
    statusCode: 200,
    message: `Retrieved ${requests.length} blood request(s)`,
    data: {
      requests,
      total: requests.length,
    },
  });
});

// GET /api/v1/blood-requests/my — Get authenticated user's own created blood requests
const getMyRequests = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const requests = await BloodRequest.find({ requesterId: userId })
    .sort({ createdAt: -1 })
    .exec();

  // Evaluate expiration for each request
  for (const reqDoc of requests) {
    if (evaluateRequestExpiration(reqDoc)) {
      await reqDoc.save();
    }
  }

  return sendSuccess(res, {
    statusCode: 200,
    message: `Retrieved ${requests.length} of your blood request(s)`,
    data: {
      requests,
      total: requests.length,
    },
  });
});

// GET /api/v1/blood-requests/:id — Get details of a single blood request
const getRequestById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return sendError(res, {
      statusCode: 400,
      message: 'Invalid blood request ID format',
    });
  }

  const bloodRequest = await BloodRequest.findById(id)
    .populate('requesterId', 'fullName name phone bloodGroup')
    .populate('acceptedDonorId', 'fullName name phone bloodGroup')
    .exec();

  if (!bloodRequest) {
    return sendError(res, {
      statusCode: 404,
      message: 'Blood request not found',
    });
  }

  // Check expiration
  if (evaluateRequestExpiration(bloodRequest)) {
    await bloodRequest.save();
  }

  const json = bloodRequest.toJSON();
  const userIdStr = req.user._id.toString();
  const isRequester = bloodRequest.requesterId && (bloodRequest.requesterId._id?.toString() === userIdStr || bloodRequest.requesterId.toString() === userIdStr);
  const isAcceptedDonor = bloodRequest.acceptedDonorId && (bloodRequest.acceptedDonorId._id?.toString() === userIdStr || bloodRequest.acceptedDonorId.toString() === userIdStr);
  const isStaffOrAdmin = req.user.role && ['ADMIN', 'HOSPITAL_STAFF'].includes(req.user.role);

  // SECURITY: Omit private phone numbers for unauthorized third-party viewers
  if (!isRequester && !isAcceptedDonor && !isStaffOrAdmin) {
    if (json.requesterId && typeof json.requesterId === 'object') delete json.requesterId.phone;
    if (json.acceptedDonorId && typeof json.acceptedDonorId === 'object') delete json.acceptedDonorId.phone;
  }

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Blood request retrieved successfully',
    data: {
      request: json,
    },
  });
});

// PATCH /api/v1/blood-requests/:id — Update request (Requester only, editable fields only)
const updateRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return sendError(res, {
      statusCode: 400,
      message: 'Invalid blood request ID format',
    });
  }

  const bloodRequest = await BloodRequest.findById(id);

  if (!bloodRequest) {
    return sendError(res, {
      statusCode: 404,
      message: 'Blood request not found',
    });
  }

  // Authorization Check: Only requester can modify
  if (bloodRequest.requesterId.toString() !== req.user._id.toString()) {
    return sendError(res, {
      statusCode: 403,
      message: 'You are not authorized to update this blood request',
    });
  }

  // Lifecycle Check: Cannot edit fulfilled, cancelled, or expired requests
  if (['FULFILLED', 'CANCELLED', 'EXPIRED'].includes(bloodRequest.status)) {
    return sendError(res, {
      statusCode: 400,
      message: `Cannot edit a blood request with status '${bloodRequest.status}'`,
    });
  }

  const {
    patientName,
    bloodGroup,
    unitsRequired,
    urgency,
    hospitalName,
    hospitalAddress,
    hospitalLatitude,
    hospitalLongitude,
    requiredBy,
    reason,
    contactPhone,
    additionalNotes,
  } = req.body;

  if (patientName !== undefined) bloodRequest.patientName = patientName;
  if (bloodGroup !== undefined) bloodRequest.bloodGroup = bloodGroup;
  if (unitsRequired !== undefined) bloodRequest.unitsRequired = unitsRequired;
  if (urgency !== undefined) bloodRequest.urgency = urgency;
  if (hospitalName !== undefined) bloodRequest.hospitalName = hospitalName;
  if (hospitalAddress !== undefined) bloodRequest.hospitalAddress = hospitalAddress;
  if (requiredBy !== undefined) bloodRequest.requiredBy = requiredBy ? new Date(requiredBy) : null;
  if (reason !== undefined) bloodRequest.reason = reason;
  if (contactPhone !== undefined) bloodRequest.contactPhone = contactPhone;
  if (additionalNotes !== undefined) bloodRequest.additionalNotes = additionalNotes;

  if (hospitalLatitude !== undefined && hospitalLongitude !== undefined) {
    const lat = Number(hospitalLatitude);
    const lng = Number(hospitalLongitude);
    bloodRequest.hospitalLatitude = lat;
    bloodRequest.hospitalLongitude = lng;
    bloodRequest.location = {
      type: 'Point',
      coordinates: [lng, lat],
    };
  }

  await bloodRequest.save();

  logger.info(`Updated BloodRequest: ${bloodRequest._id}`);

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Blood request updated successfully',
    data: {
      request: bloodRequest,
    },
  });
});

// POST /api/v1/blood-requests/:id/cancel — Cancel an open or matching blood request
const cancelRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return sendError(res, {
      statusCode: 400,
      message: 'Invalid blood request ID format',
    });
  }

  const bloodRequest = await BloodRequest.findById(id);

  if (!bloodRequest) {
    return sendError(res, {
      statusCode: 404,
      message: 'Blood request not found',
    });
  }

  // Authorization Check: Only requester can cancel
  if (bloodRequest.requesterId.toString() !== req.user._id.toString()) {
    return sendError(res, {
      statusCode: 403,
      message: 'You are not authorized to cancel this blood request',
    });
  }

  // Lifecycle Check: Validate status transition to CANCELLED
  try {
    validateStatusTransition(bloodRequest.status, 'CANCELLED');
  } catch (transitionErr) {
    return sendError(res, {
      statusCode: 400,
      message: transitionErr.message,
    });
  }

  bloodRequest.status = 'CANCELLED';
  bloodRequest.cancelledAt = new Date();

  await bloodRequest.save();

  logger.info(`BloodRequest cancelled: ${bloodRequest._id} by user: ${req.user._id}`);

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Blood request cancelled successfully',
    data: {
      request: bloodRequest,
    },
  });
});

// GET /api/v1/blood-requests/available — Get nearby available blood requests for potential donor
const getAvailableRequests = asyncHandler(async (req, res) => {
  const donorUser = req.user;
  const radiusKm = Number(req.query.radius || req.query.radiusKm) || 50;
  const urgency = req.query.urgency;
  const specifiedBloodGroup = req.query.bloodGroup;

  // Determine donor location
  let userLat = req.query.latitude !== undefined && req.query.latitude !== '' ? Number(req.query.latitude) : null;
  let userLng = req.query.longitude !== undefined && req.query.longitude !== '' ? Number(req.query.longitude) : null;

  if ((userLat === null || userLng === null || isNaN(userLat) || isNaN(userLng)) && donorUser.location && Array.isArray(donorUser.location.coordinates) && donorUser.location.coordinates.length === 2) {
    const [lng, lat] = donorUser.location.coordinates;
    if (lat !== undefined && lng !== undefined && !isNaN(lat) && !isNaN(lng) && (lat !== 0 || lng !== 0)) {
      userLat = lat;
      userLng = lng;
    }
  }

  // Determine blood group compatibility filter
  let recipientBloodGroups = null;
  if (specifiedBloodGroup) {
    recipientBloodGroups = [specifiedBloodGroup.trim().toUpperCase()];
  } else if (donorUser.bloodGroup) {
    try {
      recipientBloodGroups = getCompatibleRecipientGroups(donorUser.bloodGroup);
    } catch (err) {
      logger.warn(`Could not get recipient blood groups for donor group ${donorUser.bloodGroup}: ${err.message}`);
    }
  }

  // Base Query: Active requests not created by the donor
  const queryFilter = {
    requesterId: { $ne: donorUser._id },
    status: { $in: ['OPEN', 'MATCHING', 'HOSPITAL_VERIFIED', 'ADMIN_VERIFIED', 'DONOR_RESPONDED'] },
  };

  if (recipientBloodGroups && recipientBloodGroups.length > 0) {
    queryFilter.bloodGroup = { $in: recipientBloodGroups };
  }

  if (urgency) {
    queryFilter.urgency = urgency.toUpperCase();
  }

  // Geospatial $centerSphere Filter if coordinates are available
  const EARTH_RADIUS_KM = 6378.1;
  if (userLat !== null && userLng !== null && !isNaN(userLat) && !isNaN(userLng) && (userLat !== 0 || userLng !== 0)) {
    const radiusInRadians = radiusKm / EARTH_RADIUS_KM;
    queryFilter.location = {
      $geoWithin: {
        $centerSphere: [[userLng, userLat], radiusInRadians],
      },
    };
  }

  const requests = await BloodRequest.find(queryFilter)
    .populate('requesterId', 'fullName name phone bloodGroup')
    .sort({ createdAt: -1 })
    .exec();

  // Evaluate Expiration & Filter Active
  const activeRequests = [];
  for (const reqDoc of requests) {
    if (evaluateRequestExpiration(reqDoc)) {
      await reqDoc.save();
    }
    if (reqDoc.status !== 'EXPIRED' && reqDoc.status !== 'CANCELLED') {
      activeRequests.push(reqDoc);
    }
  }

  // Fetch Donor Match status for each request for this donor
  const requestIds = activeRequests.map((r) => r._id);
  const existingMatches = await DonorMatch.find({
    bloodRequest: { $in: requestIds },
    donor: donorUser._id,
  }).exec();

  const matchMap = new Map();
  existingMatches.forEach((m) => matchMap.set(m.bloodRequest.toString(), m));

  const formattedRequests = activeRequests.map((reqDoc) => {
    const json = reqDoc.toJSON();
    const existingMatch = matchMap.get(reqDoc._id.toString());

    let distanceKm = null;
    if (existingMatch && existingMatch.distanceKm != null) {
      distanceKm = existingMatch.distanceKm;
    } else if (userLat !== null && userLng !== null && reqDoc.hospitalLatitude && reqDoc.hospitalLongitude) {
      distanceKm = calculateDistanceKm(userLat, userLng, reqDoc.hospitalLatitude, reqDoc.hospitalLongitude);
    }

    json.myMatchStatus = existingMatch ? existingMatch.status : null;
    json.myMatchId = existingMatch ? existingMatch._id : null;
    json.distanceKm = distanceKm;
    json.formattedDistance = formatDistance(distanceKm);

    // SECURITY: Remove requester phone unless donor has ACCEPTED match
    if (json.requesterId && json.myMatchStatus !== 'ACCEPTED') {
      delete json.requesterId.phone;
    }

    return json;
  });

  // Sort: Nearest distance first if available, otherwise by createdAt descending
  formattedRequests.sort((a, b) => {
    if (a.distanceKm != null && b.distanceKm != null) {
      return a.distanceKm - b.distanceKm;
    }
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  return sendSuccess(res, {
    statusCode: 200,
    message: `Retrieved ${formattedRequests.length} available blood request(s) within ${radiusKm}km`,
    data: {
      requests: formattedRequests,
      total: formattedRequests.length,
      radiusKm,
    },
  });
});

// POST /api/v1/blood-requests/:id/respond — Respond to a blood request (I_CAN_DONATE / NOT_AVAILABLE)
const respondToRequestByRequestId = asyncHandler(async (req, res) => {
  const requestId = req.params.requestId || req.params.id;
  const { response, status, action: reqAction, reason } = req.body;
  const actionStr = (response || status || reqAction || '').toUpperCase();
  const donorUser = req.user;

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

  // Prevent self-donation
  if (bloodRequest.requesterId.toString() === donorUser._id.toString()) {
    return sendError(res, {
      statusCode: 400,
      message: 'You cannot donate to your own blood request',
    });
  }

  if (['CANCELLED', 'EXPIRED', 'FULFILLED'].includes(bloodRequest.status)) {
    return sendError(res, {
      statusCode: 400,
      message: `Cannot respond to a blood request with status '${bloodRequest.status}'`,
    });
  }

  // Check if donor match already exists
  let match = await DonorMatch.findOne({
    bloodRequest: bloodRequest._id,
    donor: donorUser._id,
  });

  const isAccepting = ['ACCEPTED', 'I_CAN_DONATE', 'YES', 'ACCEPT'].includes(actionStr);
  const isRejecting = ['REJECTED', 'NOT_AVAILABLE', 'NO', 'DECLINE', 'REJECT'].includes(actionStr);

  if (!isAccepting && !isRejecting) {
    return sendError(res, {
      statusCode: 400,
      message: "Invalid action. Must be 'I_CAN_DONATE' ('ACCEPTED') or 'NOT_AVAILABLE' ('REJECTED')",
    });
  }

  if (isAccepting) {
    // Concurrency check: If already accepted by another donor
    if (bloodRequest.status === 'ACCEPTED' && bloodRequest.acceptedDonorId && bloodRequest.acceptedDonorId.toString() !== donorUser._id.toString()) {
      return sendError(res, {
        statusCode: 409,
        message: 'This emergency request has already been claimed by another donor',
      });
    }

    if (match) {
      if (match.status === 'ACCEPTED') {
        return sendSuccess(res, {
          statusCode: 200,
          message: 'Match is already accepted',
          data: { match, request: bloodRequest },
        });
      }
      match.status = 'ACCEPTED';
      match.respondedAt = new Date();
      await match.save();
    } else {
      // Calculate distance if donor location is available
      let distanceKm = 0;
      if (donorUser.location && Array.isArray(donorUser.location.coordinates) && donorUser.location.coordinates.length === 2 && bloodRequest.hospitalLatitude && bloodRequest.hospitalLongitude) {
        const [dLng, dLat] = donorUser.location.coordinates;
        if (dLat && dLng) {
          distanceKm = calculateDistanceKm(dLat, dLng, bloodRequest.hospitalLatitude, bloodRequest.hospitalLongitude);
        }
      }

      match = new DonorMatch({
        bloodRequest: bloodRequest._id,
        donor: donorUser._id,
        requester: bloodRequest.requesterId,
        donorBloodGroup: donorUser.bloodGroup || 'UNKNOWN',
        requestedBloodGroup: bloodRequest.bloodGroup,
        distanceKm,
        status: 'ACCEPTED',
        respondedAt: new Date(),
        expiresAt: bloodRequest.requiredBy || new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
      await match.save();
    }

    // Atomic Update BloodRequest
    if (['OPEN', 'HOSPITAL_VERIFIED', 'ADMIN_VERIFIED', 'MATCHING'].includes(bloodRequest.status)) {
      bloodRequest.status = 'DONOR_RESPONDED';
    }
    if (!bloodRequest.acceptedDonorId) {
      bloodRequest.acceptedDonorId = donorUser._id;
    }
    if (!bloodRequest.notificationCampaign) bloodRequest.notificationCampaign = {};
    bloodRequest.notificationCampaign.acceptedCount = (bloodRequest.notificationCampaign.acceptedCount || 0) + 1;
    bloodRequest.notificationCampaign.isStopped = true;
    bloodRequest.notificationCampaign.stopReason = 'DONOR_ACCEPTED';
    bloodRequest.notificationCampaign.nextBatchScheduledAt = null;
    await bloodRequest.save();

    // Audit Log
    try {
      const AuditLog = require('../models/AuditLog');
      await AuditLog.create({
        performedBy: donorUser._id,
        userRole: donorUser.role,
        action: 'DONOR_ACCEPTED_REQUEST',
        entityType: 'BloodRequest',
        entityId: bloodRequest._id.toString(),
        newState: { status: bloodRequest.status, acceptedDonorId: donorUser._id.toString() },
        reason: 'Donor accepted emergency blood request',
      });
    } catch (auditErr) {
      logger.warn(`AuditLog creation error for donor acceptance: ${auditErr.message}`);
    }

    // FCM Notification to Requester
    try {
      const { sendNotificationToUser } = require('../services/notificationService');
      const donorName = donorUser.fullName || donorUser.name || 'A compatible donor';
      await sendNotificationToUser(
        bloodRequest.requesterId,
        'DONOR_ACCEPTED',
        '✅ Donor Found ❤️',
        `${donorName} (${donorUser.bloodGroup || ''}) has accepted your emergency blood request for ${bloodRequest.patientName}.`,
        { bloodRequestId: String(bloodRequest._id), matchId: String(match._id) },
        bloodRequest._id,
        match._id
      );
    } catch (notifErr) {
      logger.error(`Failed to send accept notification to requester: ${notifErr.message}`);
    }

    // FCM Notification Confirmation to Donor
    try {
      const { sendNotificationToUser } = require('../services/notificationService');
      await sendNotificationToUser(
        donorUser._id,
        'DONOR_CONFIRMATION',
        '❤️ Donation Confirmed!',
        `Thank you! You have committed to donate blood for ${bloodRequest.patientName} at ${bloodRequest.hospitalName}.`,
        { bloodRequestId: String(bloodRequest._id), matchId: String(match._id) },
        bloodRequest._id,
        match._id
      );
    } catch (notifErr) {
      logger.error(`Failed to send confirmation notification to donor: ${notifErr.message}`);
    }

    logger.info(`Donor ${donorUser._id} accepted BloodRequest ${bloodRequest._id} directly`);

    return sendSuccess(res, {
      statusCode: 200,
      message: 'You have successfully accepted the emergency blood request',
      data: { match, request: bloodRequest },
    });

  } else if (isRejecting) {
    if (match) {
      if (match.status === 'REJECTED') {
        return sendSuccess(res, {
          statusCode: 200,
          message: 'Match is already declined',
          data: { match },
        });
      }
      match.status = 'REJECTED';
      match.respondedAt = new Date();
      if (reason) match.rejectionReason = reason;
      await match.save();
    } else {
      match = new DonorMatch({
        bloodRequest: bloodRequest._id,
        donor: donorUser._id,
        requester: bloodRequest.requesterId,
        donorBloodGroup: donorUser.bloodGroup || 'UNKNOWN',
        requestedBloodGroup: bloodRequest.bloodGroup,
        distanceKm: 0,
        status: 'REJECTED',
        rejectionReason: reason || 'Not available',
        respondedAt: new Date(),
        expiresAt: bloodRequest.requiredBy || new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
      await match.save();
    }

    if (!bloodRequest.notificationCampaign) bloodRequest.notificationCampaign = {};
    bloodRequest.notificationCampaign.rejectedCount = (bloodRequest.notificationCampaign.rejectedCount || 0) + 1;
    await bloodRequest.save();

    logger.info(`Donor ${donorUser._id} declined BloodRequest ${bloodRequest._id} directly`);

    return sendSuccess(res, {
      statusCode: 200,
      message: 'You have declined the blood request',
      data: { match },
    });
  }
});

module.exports = {
  createRequest,
  getAllRequests,
  getAvailableRequests,
  getMyRequests,
  getRequestById,
  updateRequest,
  cancelRequest,
  respondToRequestByRequestId,
};
