'use strict';

const mongoose = require('mongoose');
const Organization = require('../models/Organization');
const User = require('../models/User');
const BloodRequest = require('../models/BloodRequest');
const BloodInventory = require('../models/BloodInventory');
const DonationCamp = require('../models/DonationCamp');
const AuditLog = require('../models/AuditLog');
const { generateTokenPair } = require('../services/jwtService');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../utils/logger');

// POST /api/v1/organizations/register — Register a new Hospital or Blood Bank
const registerOrganization = asyncHandler(async (req, res) => {
  const {
    name,
    type,
    registrationLicense,
    address,
    city,
    state,
    pincode,
    latitude,
    longitude,
    contactPhone,
    officialEmail,
    authorizedPersonName,
    authorizedPersonDesignation,
    authorizedPersonPhone,
    authorizedPersonEmail,
    password,
  } = req.body;

  const existingOrg = await Organization.findOne({ officialEmail: officialEmail.toLowerCase() });
  if (existingOrg) {
    return sendError(res, {
      statusCode: 400,
      message: 'An organization with this official email is already registered',
    });
  }

  const lat = latitude ? parseFloat(latitude) : 28.6139;
  const lng = longitude ? parseFloat(longitude) : 77.2090;

  const organization = new Organization({
    name,
    type,
    registrationLicense,
    address: {
      street: address || '',
      city,
      state,
      pincode: pincode || '',
      country: 'India',
    },
    location: {
      type: 'Point',
      coordinates: [lng, lat],
    },
    contactPhone,
    officialEmail: officialEmail.toLowerCase(),
    authorizedPerson: {
      name: authorizedPersonName,
      designation: authorizedPersonDesignation || 'Manager',
      phone: authorizedPersonPhone,
      email: authorizedPersonEmail || officialEmail,
    },
    status: 'PENDING_VERIFICATION',
  });

  await organization.save();

  // Create initial staff user account linked to this organization
  const role = type === 'HOSPITAL' ? 'HOSPITAL_MANAGER' : 'BLOOD_BANK_MANAGER';
  const staffUser = new User({
    firebaseUid: `org_${organization._id}_${Date.now()}`,
    phone: authorizedPersonPhone.startsWith('+') ? authorizedPersonPhone : `+91${authorizedPersonPhone.replace(/\D/g, '').slice(-10)}`,
    fullName: authorizedPersonName,
    name: authorizedPersonName,
    email: officialEmail.toLowerCase(),
    role,
    organizationId: organization._id,
    accountStatus: 'ACTIVE',
    isVerified: true,
  });

  await staffUser.save();

  // Create initial empty blood inventory records for all 8 blood groups
  const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  const inventoryDocs = BLOOD_GROUPS.map((bg) => ({
    organizationId: organization._id,
    bloodGroup: bg,
    availableUnits: 10,
    reservedUnits: 0,
    lowStockThreshold: 5,
  }));
  await BloodInventory.insertMany(inventoryDocs);

  logger.info(`New Organization registered: ${name} (${type}) ID: ${organization._id} Status: PENDING_VERIFICATION`);

  return sendSuccess(res, {
    statusCode: 201,
    message: 'Organization registered successfully and is pending admin verification',
    data: {
      organization,
    },
  });
});

// POST /api/v1/organizations/login — Organization Staff Login
const loginOrganization = asyncHandler(async (req, res) => {
  const { email, phone } = req.body;

  let query = {};
  if (email) query.email = email.toLowerCase();
  else if (phone) query.phone = phone;
  else {
    return sendError(res, {
      statusCode: 400,
      message: 'Official email or contact phone is required',
    });
  }

  const user = await User.findOne(query).populate('organizationId');
  if (!user || !user.organizationId) {
    return sendError(res, {
      statusCode: 401,
      message: 'No registered Organization account found matching these credentials',
    });
  }

  const organization = user.organizationId;
  if (organization.status === 'SUSPENDED') {
    return sendError(res, {
      statusCode: 403,
      message: 'Organization account is suspended. Contact WE DONATE admin.',
    });
  }

  const tokens = await generateTokenPair(user);

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Organization login successful',
    data: {
      user: user.toProfileJSON(),
      organization,
      tokens,
    },
  });
});

// GET /api/v1/organizations/me — Get Current Organization Profile & Dashboard Analytics
const getMyOrganization = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user.organizationId) {
    return sendError(res, {
      statusCode: 403,
      message: 'Authenticated account is not linked to any Organization',
    });
  }

  const organization = await Organization.findById(user.organizationId);
  if (!organization) {
    return sendError(res, {
      statusCode: 404,
      message: 'Organization record not found',
    });
  }

  // Dashboard Analytics Metrics
  const totalRequests = await BloodRequest.countDocuments({
    $or: [{ targetOrganizationId: organization._id }, { hospitalName: new RegExp(organization.name, 'i') }],
  });

  const pendingVerificationRequests = await BloodRequest.countDocuments({
    $or: [{ targetOrganizationId: organization._id }, { hospitalName: new RegExp(organization.name, 'i') }],
    status: 'VERIFICATION_PENDING',
  });

  const verifiedRequests = await BloodRequest.countDocuments({
    $or: [{ targetOrganizationId: organization._id }, { hospitalName: new RegExp(organization.name, 'i') }],
    status: { $in: ['HOSPITAL_VERIFIED', 'ADMIN_VERIFIED', 'MATCHING'] },
  });

  const fulfilledRequests = await BloodRequest.countDocuments({
    $or: [{ targetOrganizationId: organization._id }, { hospitalName: new RegExp(organization.name, 'i') }],
    status: 'FULFILLED',
  });

  const activeCamps = await DonationCamp.countDocuments({
    organizationId: organization._id,
    status: { $in: ['PUBLISHED', 'ONGOING'] },
  });

  const inventory = await BloodInventory.find({ organizationId: organization._id });
  const criticalLowGroups = inventory.filter((item) => item.availableUnits <= item.lowStockThreshold).map((item) => item.bloodGroup);

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Organization profile and analytics retrieved',
    data: {
      organization,
      metrics: {
        totalRequests,
        pendingVerificationRequests,
        verifiedRequests,
        fulfilledRequests,
        activeCamps,
        criticalLowGroups,
      },
      inventory,
    },
  });
});

// GET /api/v1/organizations/requests — Verification Queue for Hospital
const getOrganizationRequestsQueue = asyncHandler(async (req, res) => {
  const user = req.user;
  const organization = await Organization.findById(user.organizationId);

  const filter = {
    $or: [
      { targetOrganizationId: user.organizationId },
      { hospitalName: new RegExp(organization?.name || '', 'i') },
    ],
  };

  if (req.query.status) {
    filter.status = req.query.status;
  }

  const requests = await BloodRequest.find(filter)
    .populate('requesterId', 'fullName name phone bloodGroup email')
    .sort({ createdAt: -1 })
    .exec();

  return sendSuccess(res, {
    statusCode: 200,
    message: `Retrieved ${requests.length} request(s) in organization queue`,
    data: {
      requests,
    },
  });
});

// PATCH /api/v1/organizations/requests/:id/verify — Hospital Verify & Approve Blood Request
const verifyRequestByHospital = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { notes } = req.body;
  const user = req.user;

  const bloodRequest = await BloodRequest.findById(id);
  if (!bloodRequest) {
    return sendError(res, {
      statusCode: 404,
      message: 'Blood request not found',
    });
  }

  // Security Check: Hospital staff can only verify requests targeting their hospital
  if (bloodRequest.targetOrganizationId && user.organizationId && bloodRequest.targetOrganizationId.toString() !== user.organizationId.toString()) {
    return sendError(res, {
      statusCode: 403,
      message: 'You can only verify blood requests targeted to your own hospital',
    });
  }

  const previousState = bloodRequest.status;
  bloodRequest.status = 'HOSPITAL_VERIFIED';
  bloodRequest.verifiedBy = user._id;
  bloodRequest.verificationSource = 'HOSPITAL';
  bloodRequest.verificationNotes = notes || 'Verified by hospital staff via phone call/hospital record check';
  await bloodRequest.save();

  // Create Audit Log
  await AuditLog.create({
    performedBy: user._id,
    userRole: user.role,
    action: 'HOSPITAL_VERIFIED_REQUEST',
    entityType: 'BloodRequest',
    entityId: bloodRequest._id.toString(),
    previousState: { status: previousState },
    newState: { status: 'HOSPITAL_VERIFIED' },
    reason: notes || 'Hospital verified patient requirement',
  });

  logger.info(`BloodRequest ${bloodRequest._id} VERIFIED by Hospital Staff ${user._id}`);

  // Trigger targeted donor matching engine
  try {
    const { findAndMatchNearbyDonors } = require('../services/donorMatchingService');
    await findAndMatchNearbyDonors(bloodRequest._id);
  } catch (matchErr) {
    logger.warn(`Donor matching warning after verification: ${matchErr.message}`);
  }

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Blood request verified and approved by hospital. Targeted donor matching initiated.',
    data: {
      request: bloodRequest,
    },
  });
});

// PATCH /api/v1/organizations/requests/:id/reject — Hospital Reject Blood Request
const rejectRequestByHospital = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rejectionReason } = req.body;
  const user = req.user;

  if (!rejectionReason) {
    return sendError(res, {
      statusCode: 400,
      message: 'Rejection reason is required',
    });
  }

  const bloodRequest = await BloodRequest.findById(id);
  if (!bloodRequest) {
    return sendError(res, {
      statusCode: 404,
      message: 'Blood request not found',
    });
  }

  const previousState = bloodRequest.status;
  bloodRequest.status = 'REJECTED';
  bloodRequest.rejectionReason = rejectionReason;
  bloodRequest.verifiedBy = user._id;
  bloodRequest.verificationSource = 'HOSPITAL';
  await bloodRequest.save();

  // Create Audit Log
  await AuditLog.create({
    performedBy: user._id,
    userRole: user.role,
    action: 'HOSPITAL_REJECTED_REQUEST',
    entityType: 'BloodRequest',
    entityId: bloodRequest._id.toString(),
    previousState: { status: previousState },
    newState: { status: 'REJECTED', rejectionReason },
    reason: rejectionReason,
  });

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Blood request rejected',
    data: {
      request: bloodRequest,
    },
  });
});

module.exports = {
  registerOrganization,
  loginOrganization,
  getMyOrganization,
  getOrganizationRequestsQueue,
  verifyRequestByHospital,
  rejectRequestByHospital,
};
