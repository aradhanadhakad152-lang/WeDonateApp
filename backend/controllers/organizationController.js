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

  if (password) {
    if (password.length < 8) {
      return sendError(res, {
        statusCode: 400,
        message: 'Password must be at least 8 characters long',
      });
    }
    staffUser.password = password;
  }

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
  const { email, phone, password } = req.body;

  let query = {};
  if (email) query.email = email.toLowerCase();
  else if (phone) query.phone = phone;
  else {
    return sendError(res, {
      statusCode: 400,
      message: 'Official email or contact phone is required',
    });
  }

  const user = await User.findOne(query).select('+password').populate('organizationId');
  if (!user || !user.organizationId) {
    return sendError(res, {
      statusCode: 401,
      message: 'No registered Organization account found matching these credentials',
    });
  }

  const organization = user.organizationId;
  if (user.accountStatus === 'SUSPENDED' || user.isActive === false || organization.status === 'SUSPENDED') {
    return sendError(res, {
      statusCode: 403,
      message: 'Organization account is suspended. Contact WE DONATE admin.',
    });
  }

  // Password verification flow
  if (user.password) {
    if (!password) {
      return sendError(res, {
        statusCode: 400,
        message: 'Password is required for organization login',
      });
    }
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return sendError(res, {
        statusCode: 401,
        message: 'Invalid organization credentials (incorrect password)',
      });
    }
  } else {
    if (!password) {
      return sendError(res, {
        statusCode: 401,
        message: 'Password has not been set for this organization account. Please request Admin password setup.',
      });
    }
    // Store and hash password on first login attempt if password provided
    user.password = password;
    await user.save();
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
  if (!user.organizationId) {
    return sendError(res, {
      statusCode: 403,
      message: 'Authenticated user is not linked to an Organization',
    });
  }

  const organization = await Organization.findById(user.organizationId);

  // Strict Organization Isolation: Only return requests targeted to this hospital
  const filter = {
    $or: [
      { targetOrganizationId: user.organizationId },
    ],
  };

  if (organization?.name && organization.name.trim().length > 0) {
    filter.$or.push({
      targetOrganizationId: null,
      hospitalName: new RegExp(`^${organization.name.trim().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i'),
    });
  }

  if (req.query.status) {
    filter.status = req.query.status;
  }
  if (req.query.bloodGroup) {
    filter.bloodGroup = req.query.bloodGroup;
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

  if (!user.organizationId) {
    return sendError(res, {
      statusCode: 403,
      message: 'Authenticated user is not linked to an Organization',
    });
  }

  const bloodRequest = await BloodRequest.findById(id);
  if (!bloodRequest) {
    return sendError(res, {
      statusCode: 404,
      message: 'Blood request not found',
    });
  }

  // Security Check: Hospital staff can only verify requests targeting their hospital
  const isTargetOrg = bloodRequest.targetOrganizationId && bloodRequest.targetOrganizationId.toString() === user.organizationId.toString();
  if (!isTargetOrg) {
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

  if (!user.organizationId) {
    return sendError(res, {
      statusCode: 403,
      message: 'Authenticated user is not linked to an Organization',
    });
  }

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

  // Security Check: Hospital staff can only reject requests targeting their hospital
  const isTargetOrg = bloodRequest.targetOrganizationId && bloodRequest.targetOrganizationId.toString() === user.organizationId.toString();
  if (!isTargetOrg) {
    return sendError(res, {
      statusCode: 403,
      message: 'You can only reject blood requests targeted to your own hospital',
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

// PATCH /api/v1/organizations/requests/:id/confirm-donor — Confirm Responding Donor
const confirmDonorByHospital = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { donorId, notes } = req.body;
  const user = req.user;

  if (!user.organizationId) {
    return sendError(res, { statusCode: 403, message: 'Authenticated user is not linked to an Organization' });
  }

  const bloodRequest = await BloodRequest.findById(id);
  if (!bloodRequest) {
    return sendError(res, { statusCode: 404, message: 'Blood request not found' });
  }

  // Security Check: Organization isolation
  if (bloodRequest.targetOrganizationId && bloodRequest.targetOrganizationId.toString() !== user.organizationId.toString()) {
    return sendError(res, { statusCode: 403, message: 'You can only confirm donors for requests targeted to your own hospital' });
  }

  const previousState = bloodRequest.status;
  bloodRequest.status = 'DONOR_CONFIRMED';
  if (donorId && mongoose.Types.ObjectId.isValid(donorId)) {
    bloodRequest.acceptedDonorId = donorId;
  }
  await bloodRequest.save();

  // Audit Log
  await AuditLog.create({
    performedBy: user._id,
    userRole: user.role,
    action: 'HOSPITAL_CONFIRMED_DONOR',
    entityType: 'BloodRequest',
    entityId: bloodRequest._id.toString(),
    previousState: { status: previousState },
    newState: { status: 'DONOR_CONFIRMED', acceptedDonorId: bloodRequest.acceptedDonorId },
    reason: notes || 'Hospital confirmed donor appointment',
  });

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Donor confirmed for blood request. Physical donation visit pending.',
    data: { request: bloodRequest },
  });
});

// PATCH /api/v1/organizations/requests/:id/complete — Authorized Hospital Marks Physical Donation Completed
const completeDonationByHospital = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { unitsDonated, notes } = req.body;
  const user = req.user;

  if (!user.organizationId) {
    return sendError(res, { statusCode: 403, message: 'Authenticated user is not linked to an Organization' });
  }

  const bloodRequest = await BloodRequest.findById(id);
  if (!bloodRequest) {
    return sendError(res, { statusCode: 404, message: 'Blood request not found' });
  }

  // Security Check: Organization isolation
  if (bloodRequest.targetOrganizationId && bloodRequest.targetOrganizationId.toString() !== user.organizationId.toString()) {
    return sendError(res, { statusCode: 403, message: 'You can only complete physical donations for requests targeted to your own hospital' });
  }

  if (bloodRequest.status === 'FULFILLED') {
    return sendSuccess(res, {
      statusCode: 200,
      message: 'Donation has already been marked as COMPLETED',
      data: { request: bloodRequest },
    });
  }

  const previousState = bloodRequest.status;
  const unitsCount = Number(unitsDonated) || bloodRequest.unitsRequired || 1;

  // 1. Update BloodRequest status to FULFILLED
  bloodRequest.status = 'FULFILLED';
  bloodRequest.fulfilledAt = new Date();
  await bloodRequest.save();

  // 2. ATOMIC INVENTORY UPDATE: Increment stock in BloodInventory ONLY at COMPLETED physical donation
  const bloodGroup = bloodRequest.bloodGroup;
  let inventoryItem = await BloodInventory.findOne({
    organizationId: user.organizationId,
    bloodGroup,
  });

  if (!inventoryItem) {
    inventoryItem = new BloodInventory({
      organizationId: user.organizationId,
      bloodGroup,
      availableUnits: unitsCount,
      reservedUnits: 0,
      lowStockThreshold: 5,
      lastUpdatedBy: user._id,
    });
  } else {
    inventoryItem.availableUnits = (inventoryItem.availableUnits || 0) + unitsCount;
    inventoryItem.lastUpdatedBy = user._id;
  }
  await inventoryItem.save();

  // 3. Update Donor Profile & Eligibility if acceptedDonorId exists
  if (bloodRequest.acceptedDonorId) {
    const donorUser = await User.findById(bloodRequest.acceptedDonorId);
    if (donorUser) {
      donorUser.lastDonationDate = new Date();
      donorUser.isEligible = false;
      donorUser.donorStatus = 'INELIGIBLE';
      await donorUser.save();
    }
  }

  // 4. Audit Log
  await AuditLog.create({
    performedBy: user._id,
    userRole: user.role,
    action: 'PHYSICAL_DONATION_COMPLETED',
    entityType: 'BloodRequest',
    entityId: bloodRequest._id.toString(),
    previousState: { status: previousState },
    newState: { status: 'FULFILLED', unitsAddedToInventory: unitsCount },
    reason: notes || 'Physical blood donation completed and stock updated',
  });

  logger.info(`Physical donation COMPLETED for request ${bloodRequest._id}. ${unitsCount} unit(s) of ${bloodGroup} added to inventory for Org ${user.organizationId}`);

  return sendSuccess(res, {
    statusCode: 200,
    message: `Physical donation marked COMPLETED. ${unitsCount} unit(s) of ${bloodGroup} added to blood inventory.`,
    data: {
      request: bloodRequest,
      inventoryItem,
    },
  });
});

// PATCH /api/v1/organizations/me — Update Organization Profile
const updateMyOrganization = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user.organizationId) {
    return sendError(res, { statusCode: 403, message: 'Authenticated user is not linked to an Organization' });
  }

  const { name, contactPhone, street, city, state, pincode, registrationLicense } = req.body;
  const organization = await Organization.findById(user.organizationId);
  if (!organization) {
    return sendError(res, { statusCode: 404, message: 'Organization record not found' });
  }

  if (name) organization.name = name;
  if (contactPhone) organization.contactPhone = contactPhone;
  if (street) organization.address.street = street;
  if (city) organization.address.city = city;
  if (state) organization.address.state = state;
  if (pincode) organization.address.pincode = pincode;
  if (registrationLicense) organization.registrationLicense = registrationLicense;

  await organization.save();

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Organization profile updated successfully',
    data: { organization },
  });
});

// POST /api/v1/admin/organizations/:id/set-password — Admin Set/Reset Organization Password
const setOrganizationPassword = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 8) {
    return sendError(res, {
      statusCode: 400,
      message: 'New password is required and must be at least 8 characters long',
    });
  }

  const organization = await Organization.findById(id);
  if (!organization) {
    return sendError(res, {
      statusCode: 404,
      message: 'Organization not found',
    });
  }

  const staffUser = await User.findOne({ organizationId: organization._id });
  if (!staffUser) {
    return sendError(res, {
      statusCode: 404,
      message: 'No staff user account linked to this organization',
    });
  }

  staffUser.password = newPassword;
  await staffUser.save();

  await AuditLog.create({
    performedBy: req.user._id,
    userRole: req.user.role,
    action: 'ORGANIZATION_PASSWORD_SET',
    entityType: 'Organization',
    entityId: organization._id.toString(),
    newState: { organizationName: organization.name },
    reason: 'Admin securely set organization access password'
  }).catch(err => logger.error('AuditLog error:', err));

  return sendSuccess(res, {
    statusCode: 200,
    message: `Access password set successfully for '${organization.name}'`,
    data: {
      organizationId: organization._id,
      officialEmail: organization.officialEmail,
    },
  });
});

// GET /api/v1/organizations/audit-logs — Get Audit Logs for Current Organization Staff / Admin
const getOrganizationAuditLogs = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit || 50, 10);
  const filter = {};
  if (['ADMIN', 'SUPER_ADMIN'].includes(req.user.role)) {
    // Admin gets all logs
  } else {
    const orgIdStr = req.user.organizationId ? req.user.organizationId.toString() : null;
    if (orgIdStr) {
      filter.$or = [
        { performedBy: req.user._id },
        { entityId: orgIdStr }
      ];
    } else {
      filter.performedBy = req.user._id;
    }
  }

  const logs = await AuditLog.find(filter)
    .populate('performedBy', 'fullName name phone role email')
    .sort({ createdAt: -1 })
    .limit(limit)
    .exec();

  return sendSuccess(res, {
    statusCode: 200,
    message: `Retrieved ${logs.length} audit log record(s)`,
    data: { logs },
  });
});

// GET /api/v1/organizations/list — Public list of approved organizations (Hospitals / Blood Banks)
const listPublicOrganizations = asyncHandler(async (req, res) => {
  const { type, city } = req.query;
  const filter = { status: 'APPROVED' };
  if (type) filter.type = type;
  if (city) filter['address.city'] = new RegExp(city, 'i');

  const organizations = await Organization.find(filter)
    .select('_id name type address contactPhone officialEmail location')
    .sort({ name: 1 })
    .exec();

  return sendSuccess(res, {
    statusCode: 200,
    message: `Retrieved ${organizations.length} organization(s)`,
    data: { organizations },
  });
});

module.exports = {
  registerOrganization,
  loginOrganization,
  getMyOrganization,
  getOrganizationRequestsQueue,
  verifyRequestByHospital,
  rejectRequestByHospital,
  confirmDonorByHospital,
  completeDonationByHospital,
  updateMyOrganization,
  setOrganizationPassword,
  getOrganizationAuditLogs,
  listPublicOrganizations,
};
