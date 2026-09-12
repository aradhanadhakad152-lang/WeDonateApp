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
    targetOrganizationId,
  } = req.body;

  const lat = hospitalLatitude ? Number(hospitalLatitude) : 28.6139;
  const lng = hospitalLongitude ? Number(hospitalLongitude) : 77.2090;

  // Find matching organization if targetOrganizationId not specified explicitly
  const Organization = require('../models/Organization');
  let targetOrg = null;
  if (targetOrganizationId) {
    targetOrg = await Organization.findById(targetOrganizationId);
  } else if (hospitalName) {
    targetOrg = await Organization.findOne({ name: new RegExp(hospitalName, 'i') });
  }

  // Hospital staff / Admin created requests are pre-verified
  const isStaff = ['HOSPITAL_MANAGER', 'BLOOD_BANK_MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(user.role);
  const initialStatus = isStaff ? 'HOSPITAL_VERIFIED' : 'VERIFICATION_PENDING';

  const bloodRequest = new BloodRequest({
    requesterId: user._id,
    targetOrganizationId: targetOrg ? targetOrg._id : null,
    patientName,
    bloodGroup,
    unitsRequired,
    hospitalName,
    hospitalAddress,
    hospitalLatitude: lat,
    hospitalLongitude: lng,
    location: {
      type: 'Point',
      coordinates: [lng, lat],
    },
    urgency: urgency || 'NORMAL',
    requiredBy: requiredBy ? new Date(requiredBy) : undefined,
    reason,
    contactPhone,
    additionalNotes,
    status: initialStatus,
    verificationSource: isStaff ? 'HOSPITAL' : null,
    verifiedBy: isStaff ? user._id : null,
  });

  await bloodRequest.save();

  logger.info(`Emergency BloodRequest created: ${bloodRequest._id} by user: ${user._id} (${bloodGroup}, ${unitsRequired} units, status: ${initialStatus})`);

  // ONLY run donor matching engine AFTER request is verified
  if (initialStatus === 'HOSPITAL_VERIFIED' || initialStatus === 'ADMIN_VERIFIED') {
    try {
      const { findAndMatchNearbyDonors } = require('../services/donorMatchingService');
      await findAndMatchNearbyDonors(bloodRequest._id);
    } catch (matchingError) {
      logger.warn(`Auto donor matching warning for request ${bloodRequest._id}: ${matchingError.message}`);
    }
  }

  return sendSuccess(res, {
    statusCode: 201,
    message: isStaff
      ? 'Emergency blood request created and verified'
      : 'Emergency blood request created successfully. Pending hospital/admin verification before donor notification.',
    data: {
      request: bloodRequest,
    },
  });
});

// GET /api/v1/blood-requests — List active & filtered blood requests (Feed)
const getAllRequests = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    mode = 'ALL',
    status,
    bloodGroup,
    urgency,
    latitude,
    longitude,
    radius,
    dateRange,
    sort = 'newest',
  } = req.query;

  const user = req.user;
  const queryFilter = {};

  // 1. Quick Filter Modes
  if (mode === 'MY_REQUESTS') {
    queryFilter.requesterId = user._id;
  } else if (mode === 'URGENT') {
    queryFilter.urgency = { $in: ['CRITICAL', 'URGENT'] };
  } else if (mode === 'MATCHING' && user.bloodGroup) {
    // Recipient blood groups that current user (donor) can donate to
    const recipientGroupsForDonor = {
      'O-': ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'],
      'O+': ['O+', 'A+', 'B+', 'AB+'],
      'A-': ['A+', 'A-', 'AB+', 'AB-'],
      'A+': ['A+', 'AB+'],
      'B-': ['B+', 'B-', 'AB+', 'AB-'],
      'B+': ['B+', 'AB+'],
      'AB-': ['AB+', 'AB-'],
      'AB+': ['AB+'],
    };
    const compatibleRecipientGroups = recipientGroupsForDonor[user.bloodGroup.toUpperCase()] || [user.bloodGroup];
    queryFilter.bloodGroup = { $in: compatibleRecipientGroups };
  }

  // 2. Status Filter
  if (status && status !== 'ALL') {
    queryFilter.status = status;
  } else if (!status && mode !== 'MY_REQUESTS') {
    // Default: show active requests for feed
    queryFilter.status = { $in: ['OPEN', 'MATCHING', 'ACCEPTED', 'VERIFICATION_PENDING', 'HOSPITAL_VERIFIED', 'ADMIN_VERIFIED', 'DONOR_RESPONDED', 'DONOR_CONFIRMED'] };
  }

  // 3. Blood Group Filter (Explicit override)
  if (bloodGroup && bloodGroup !== 'ALL') {
    queryFilter.bloodGroup = bloodGroup;
  }

  // 4. Urgency Filter (Explicit override)
  if (urgency && urgency !== 'ALL') {
    queryFilter.urgency = urgency;
  }

  // 5. Date Range Filter
  if (dateRange && dateRange !== 'all') {
    const now = new Date();
    if (dateRange === 'today') {
      const startOfDay = new Date(now.setHours(0, 0, 0, 0));
      queryFilter.createdAt = { $gte: startOfDay };
    } else if (dateRange === 'last7days') {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      queryFilter.createdAt = { $gte: sevenDaysAgo };
    } else if (dateRange === 'last30days') {
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      queryFilter.createdAt = { $gte: thirtyDaysAgo };
    }
  }

  // 6. Geospatial Radius Filter
  const lat = latitude ? parseFloat(latitude) : null;
  const lng = longitude ? parseFloat(longitude) : null;
  const maxRadiusKm = radius ? parseFloat(radius) : null;

  if (lat !== null && lng !== null && maxRadiusKm !== null && !isNaN(lat) && !isNaN(lng) && !isNaN(maxRadiusKm)) {
    queryFilter.location = {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [lng, lat],
        },
        $maxDistance: maxRadiusKm * 1000,
      },
    };
  }

  // 7. Pagination
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  // 8. Sorting
  let sortOption = { createdAt: -1 };
  if (sort === 'urgency') {
    sortOption = { urgency: 1, createdAt: -1 };
  } else if (sort === 'expiring') {
    sortOption = { requiredBy: 1 };
  } else if (sort === 'newest') {
    sortOption = { createdAt: -1 };
  }

  // Count total matching
  const total = await BloodRequest.countDocuments(queryFilter);

  let query = BloodRequest.find(queryFilter)
    .populate('requesterId', 'fullName name bloodGroup')
    .skip(skip)
    .limit(limitNum);

  if (!queryFilter.location || sort !== 'nearest') {
    query = query.sort(sortOption);
  }

  const requests = await query.exec();

  const { calculateDistanceKm } = require('../utils/distance');

  // Evaluate expiration & compute distance
  const processedRequests = [];
  for (const reqDoc of requests) {
    if (evaluateRequestExpiration(reqDoc)) {
      await reqDoc.save();
    }
    const plainObj = reqDoc.toObject();

    // Attach distance if user GPS coordinates provided
    if (lat !== null && lng !== null && reqDoc.hospitalLatitude && reqDoc.hospitalLongitude) {
      try {
        const distance = calculateDistanceKm(lat, lng, reqDoc.hospitalLatitude, reqDoc.hospitalLongitude);
        plainObj.distanceKm = distance;
        plainObj.formattedDistance = `${distance} km`;
      } catch (distErr) {
        // Ignore distance error
      }
    }

    processedRequests.push(plainObj);
  }

  // In-memory sort by distance if requested explicitly
  if (sort === 'nearest' && lat !== null && lng !== null) {
    processedRequests.sort((a, b) => (a.distanceKm || 9999) - (b.distanceKm || 9999));
  }

  return sendSuccess(res, {
    statusCode: 200,
    message: `Retrieved ${processedRequests.length} blood request(s)`,
    data: {
      requests: processedRequests,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
      hasMore: pageNum * limitNum < total,
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
