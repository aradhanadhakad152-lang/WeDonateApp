'use strict';

const DonationCamp = require('../models/DonationCamp');
const CampRegistration = require('../models/CampRegistration');
const AuditLog = require('../models/AuditLog');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../utils/logger');

// POST /api/v1/camps — Create a new Donation Camp Drive
const createCamp = asyncHandler(async (req, res) => {
  const {
    title,
    description,
    organizationId,
    date,
    startTime,
    endTime,
    address,
    city,
    state,
    latitude,
    longitude,
    contactPhone,
    contactEmail,
    supportedBloodGroups,
    registrationLimit,
  } = req.body;

  const orgId = organizationId || req.user.organizationId;
  if (!orgId) {
    return sendError(res, {
      statusCode: 400,
      message: 'Organization ID is required',
    });
  }

  const lat = latitude ? parseFloat(latitude) : 28.6139;
  const lng = longitude ? parseFloat(longitude) : 77.2090;

  // Hospital-created camps default to PENDING_APPROVAL unless created by Admin
  const initialStatus = ['SUPER_ADMIN', 'ADMIN'].includes(req.user.role) ? 'PUBLISHED' : 'PENDING_APPROVAL';

  const camp = new DonationCamp({
    title,
    description,
    organizationId: orgId,
    date: new Date(date),
    startTime,
    endTime,
    address,
    city,
    state,
    location: {
      type: 'Point',
      coordinates: [lng, lat],
    },
    contactPhone,
    contactEmail,
    supportedBloodGroups: supportedBloodGroups || ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
    registrationLimit: registrationLimit || 200,
    status: initialStatus,
  });

  await camp.save();

  logger.info(`DonationCamp created: ${camp._id} (${title}) Status: ${initialStatus}`);

  return sendSuccess(res, {
    statusCode: 201,
    message: `Blood donation camp created (${initialStatus})`,
    data: { camp },
  });
});

// GET /api/v1/camps — List active & upcoming donation camps
const getCamps = asyncHandler(async (req, res) => {
  const { status, city, organizationId } = req.query;
  const filter = {};
  if (status) {
    filter.status = status;
  } else {
    filter.status = { $in: ['PUBLISHED', 'ONGOING', 'PENDING_APPROVAL'] };
  }

  if (city) filter.city = new RegExp(city, 'i');
  if (organizationId) filter.organizationId = organizationId;

  const camps = await DonationCamp.find(filter)
    .populate('organizationId', 'name contactPhone officialEmail address')
    .sort({ date: 1 })
    .exec();

  return sendSuccess(res, {
    statusCode: 200,
    message: `Retrieved ${camps.length} donation camp(s)`,
    data: { camps },
  });
});

// POST /api/v1/camps/:id/register — Register User for Camp
const registerForCamp = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  const camp = await DonationCamp.findById(id);
  if (!camp) {
    return sendError(res, {
      statusCode: 404,
      message: 'Donation camp not found',
    });
  }

  if (camp.registeredCount >= camp.registrationLimit) {
    return sendError(res, {
      statusCode: 400,
      message: 'Registration limit reached for this donation camp',
    });
  }

  const existingReg = await CampRegistration.findOne({ campId: id, userId: user._id });
  if (existingReg) {
    return sendError(res, {
      statusCode: 400,
      message: 'You have already registered for this donation camp',
    });
  }

  const registration = new CampRegistration({
    campId: id,
    userId: user._id,
    bloodGroup: user.bloodGroup || 'B+',
    status: 'REGISTERED',
  });

  await registration.save();

  // Increment registered count
  camp.registeredCount += 1;
  await camp.save();

  return sendSuccess(res, {
    statusCode: 201,
    message: 'Registered for donation camp successfully',
    data: { registration, camp },
  });
});

// GET /api/v1/camps/:id/registrations — Get Camp Registrations for Organization Staff
const getCampRegistrations = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const registrations = await CampRegistration.find({ campId: id })
    .populate('userId', 'fullName name phone bloodGroup email')
    .sort({ createdAt: -1 })
    .exec();

  return sendSuccess(res, {
    statusCode: 200,
    message: `Retrieved ${registrations.length} registration(s)`,
    data: { registrations },
  });
});

// POST /api/v1/camps/:id/results — Submit Aggregated Camp Donation Results
const submitCampResults = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { donationResults } = req.body;
  const user = req.user;

  const camp = await DonationCamp.findById(id);
  if (!camp) {
    return sendError(res, {
      statusCode: 404,
      message: 'Donation camp not found',
    });
  }

  let totalUnits = 0;
  if (donationResults && typeof donationResults === 'object') {
    Object.values(donationResults).forEach((val) => {
      totalUnits += Number(val) || 0;
    });
  }

  camp.donationResults = donationResults;
  camp.totalUnitsCollected = totalUnits;
  camp.status = 'COMPLETED';
  await camp.save();

  // Audit Log
  await AuditLog.create({
    performedBy: user._id,
    userRole: user.role,
    action: 'CAMP_COMPLETED_RESULTS_SUBMITTED',
    entityType: 'DonationCamp',
    entityId: camp._id.toString(),
    newState: { totalUnitsCollected: totalUnits, donationResults },
    reason: 'Post-camp aggregate donation results recorded',
  });

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Camp donation results recorded successfully',
    data: { camp },
  });
});

module.exports = {
  createCamp,
  getCamps,
  registerForCamp,
  getCampRegistrations,
  submitCampResults,
};
