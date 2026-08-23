'use strict';

const mongoose = require('mongoose');
const BloodRequest = require('../models/BloodRequest');
const { validateStatusTransition, evaluateRequestExpiration } = require('../services/bloodRequestService');
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
    urgency,
    requiredBy,
    reason,
    contactPhone,
    additionalNotes,
  } = req.body;

  const lat = Number(hospitalLatitude);
  const lng = Number(hospitalLongitude);

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
    urgency: urgency || 'NORMAL',
    requiredBy: requiredBy ? new Date(requiredBy) : undefined,
    reason,
    contactPhone,
    additionalNotes,
    status: 'OPEN',
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
    queryFilter.status = { $in: ['OPEN', 'MATCHING', 'ACCEPTED'] };
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

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Blood request retrieved successfully',
    data: {
      request: bloodRequest,
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
  if (bloodRequest.status === 'CANCELLED') {
    return sendError(res, {
      statusCode: 400,
      message: 'Blood request is already cancelled',
    });
  }
  validateStatusTransition(bloodRequest.status, 'CANCELLED');

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

module.exports = {
  createRequest,
  getAllRequests,
  getMyRequests,
  getRequestById,
  updateRequest,
  cancelRequest,
};
