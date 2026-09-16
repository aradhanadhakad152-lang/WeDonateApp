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
  const { email, loginId, phone, password } = req.body;

  const rawInput = (email || loginId || phone || '').trim().toLowerCase();
  if (!rawInput) {
    return sendError(res, {
      statusCode: 400,
      message: 'Login ID, official email, or contact phone is required',
    });
  }

  const slug = rawInput.split('@')[0];
  const query = {
    $or: [
      { email: rawInput },
      { email: `${rawInput}@wedonate.org` },
      { email: `${slug}@wedonate.org` },
      { phone: rawInput },
    ],
  };

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

  const inventory = await BloodInventory.find({ organizationId: organization._id });
  const totalAvailableUnits = inventory.reduce((sum, item) => sum + (item.availableUnits || 0), 0);
  const criticalLowGroups = inventory.filter((item) => item.availableUnits <= item.lowStockThreshold).map((item) => item.bloodGroup);

  const orgQuery = {
    $or: [{ targetOrganizationId: organization._id }, { hospitalName: new RegExp(`^${organization.name.trim().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i') }],
  };

  const totalRequests = await BloodRequest.countDocuments(orgQuery);

  const activeRequests = await BloodRequest.countDocuments({
    ...orgQuery,
    status: { $in: ['OPEN', 'VERIFICATION_PENDING', 'HOSPITAL_VERIFIED', 'MATCHING', 'DONOR_RESPONDED'] },
  });

  const pendingVerificationRequests = await BloodRequest.countDocuments({
    ...orgQuery,
    status: 'VERIFICATION_PENDING',
  });

  const verifiedRequests = await BloodRequest.countDocuments({
    ...orgQuery,
    status: { $in: ['HOSPITAL_VERIFIED', 'PATIENT_VERIFIED', 'ADMIN_VERIFIED', 'MATCHING'] },
  });

  const fulfilledRequests = await BloodRequest.countDocuments({
    ...orgQuery,
    status: 'FULFILLED',
  });

  const unitsRequiredAgg = await BloodRequest.aggregate([
    { $match: { ...orgQuery, status: { $in: ['OPEN', 'VERIFICATION_PENDING', 'HOSPITAL_VERIFIED', 'MATCHING', 'DONOR_RESPONDED'] } } },
    { $group: { _id: null, totalRequired: { $sum: '$unitsRequired' } } },
  ]);
  const bloodUnitsRequired = unitsRequiredAgg.length > 0 ? unitsRequiredAgg[0].totalRequired : 0;

  const availableDonorsCount = await User.countDocuments({ isDonor: true, isAvailable: true });

  const activeCamps = await DonationCamp.countDocuments({
    organizationId: organization._id,
    status: { $in: ['PUBLISHED', 'ONGOING'] },
  });

  // Urgent / Pending Verification Requests for Alert Banner
  const urgentRequests = await BloodRequest.find({
    ...orgQuery,
    status: { $in: ['VERIFICATION_PENDING', 'OPEN', 'MATCHING'] },
  })
    .sort({ urgency: -1, createdAt: -1 })
    .limit(3)
    .populate('requesterId', 'fullName name phone');

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Organization profile and analytics retrieved',
    data: {
      organization,
      metrics: {
        totalRequests,
        activeRequests,
        pendingVerificationRequests,
        verifiedRequests,
        fulfilledRequests,
        availableBloodUnits: totalAvailableUnits,
        totalAvailableUnits,
        availableDonorsCount,
        bloodUnitsRequired,
        activeCamps,
        criticalLowGroups,
      },
      urgentRequests,
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

  // 5. Trigger ₹99 Platform Service Fee upon qualifying completion state
  try {
    const { triggerServiceFeeForCompletedRequest } = require('./serviceFeeController');
    await triggerServiceFeeForCompletedRequest(bloodRequest);
  } catch (err) {
    logger.error(`Error triggering service fee for completed request ${bloodRequest._id}: ${err.message}`);
  }

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

// POST /api/v1/organizations/requests — Hospital Creates Blood Request
const createHospitalBloodRequest = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user.organizationId) {
    return sendError(res, {
      statusCode: 403,
      message: 'Authenticated user is not linked to any Organization',
    });
  }

  const organization = await Organization.findById(user.organizationId);
  if (!organization) {
    return sendError(res, {
      statusCode: 404,
      message: 'Linked Organization record not found',
    });
  }

  const {
    patientName,
    bloodGroup,
    unitsRequired,
    urgency,
    requiredBy,
    contactPhone,
    department,
    ward,
    notes,
    reason,
  } = req.body;

  if (!patientName || !bloodGroup || !unitsRequired) {
    return sendError(res, {
      statusCode: 400,
      message: 'Patient name, blood group, and units required are mandatory',
    });
  }

  const cleanPhone = String(contactPhone || user.phone || organization.contactPhone || '').trim();
  const formattedPhone = cleanPhone.startsWith('+') ? cleanPhone : `+91${cleanPhone.replace(/\D/g, '').slice(-10)}`;

  const lat = organization.location?.coordinates ? organization.location.coordinates[1] : 30.7046;
  const lng = organization.location?.coordinates ? organization.location.coordinates[0] : 76.7179;

  const departmentText = [department, ward].filter(Boolean).join(' - ');
  const combinedNotes = [notes, reason, departmentText ? `Dept/Ward: ${departmentText}` : null]
    .filter(Boolean)
    .join(' | ');

  const bloodRequest = new BloodRequest({
    requesterId: user._id,
    targetOrganizationId: organization._id,
    patientName: patientName.trim(),
    bloodGroup: bloodGroup.toUpperCase(),
    unitsRequired: Number(unitsRequired) || 1,
    urgency: urgency ? urgency.toUpperCase() : 'NORMAL',
    requiredBy: requiredBy ? new Date(requiredBy) : new Date(Date.now() + 24 * 60 * 60 * 1000),
    reason: combinedNotes || 'Hospital emergency blood request',
    hospitalName: organization.name,
    hospitalAddress: organization.address?.street
      ? `${organization.address.street}, ${organization.address.city || ''}`
      : organization.name,
    hospitalLatitude: lat,
    hospitalLongitude: lng,
    location: {
      type: 'Point',
      coordinates: [lng, lat],
    },
    contactPhone: formattedPhone,
    additionalNotes: combinedNotes,
    status: 'VERIFICATION_PENDING',
  });

  await bloodRequest.save();

  await AuditLog.create({
    performedBy: user._id,
    userRole: user.role,
    action: 'HOSPITAL_BLOOD_REQUEST_CREATED',
    entityType: 'BloodRequest',
    entityId: bloodRequest._id.toString(),
    newState: {
      patientName: bloodRequest.patientName,
      bloodGroup: bloodRequest.bloodGroup,
      unitsRequired: bloodRequest.unitsRequired,
      targetOrganizationId: organization._id.toString(),
      status: 'VERIFICATION_PENDING',
    },
    reason: `Hospital ${organization.name} created blood request for ${patientName}`,
  });

  logger.info(`Hospital ${organization.name} created Blood Request ${bloodRequest._id} for patient ${patientName}`);

  return sendSuccess(res, {
    statusCode: 201,
    message: 'Blood request created successfully. Status: VERIFICATION_PENDING',
    data: {
      request: bloodRequest,
    },
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

const COMPATIBILITY_MAP = {
  'A+': ['A+', 'A-', 'O+', 'O-'],
  'A-': ['A-', 'O-'],
  'B+': ['B+', 'B-', 'O+', 'O-'],
  'B-': ['B-', 'O-'],
  'AB+': ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
  'AB-': ['A-', 'B-', 'AB-', 'O-'],
  'O+': ['O+', 'O-'],
  'O-': ['O-'],
};

// GET /api/v1/organizations/find-blood — Unified Search for Compatible Donors & Blood Banks
const findBloodUnified = asyncHandler(async (req, res) => {
  const { bloodGroup, unitsRequired, radius, latitude, longitude } = req.query;

  const targetGroup = (bloodGroup || 'O+').toUpperCase();
  const compatibleGroups = COMPATIBILITY_MAP[targetGroup] || [targetGroup];
  const maxRadiusKm = parseFloat(radius) || 25;
  const reqUnits = parseInt(unitsRequired, 10) || 1;

  let userLat = latitude ? parseFloat(latitude) : 23.2599;
  let userLng = longitude ? parseFloat(longitude) : 77.4126;

  if (req.user?.organizationId) {
    const org = await Organization.findById(req.user.organizationId);
    if (org?.location?.coordinates) {
      userLng = org.location.coordinates[0];
      userLat = org.location.coordinates[1];
    }
  }

  // 1. Search Compatible Available Donors
  const candidateDonors = await User.find({
    isDonor: true,
    isAvailable: true,
    bloodGroup: { $in: compatibleGroups },
  })
    .select('_id fullName name bloodGroup isAvailable isVerified location lastDonatedAt phone')
    .limit(30)
    .exec();

  const calcDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return parseFloat((R * c).toFixed(1));
  };

  const donors = candidateDonors.map(d => {
    const dLat = d.location?.coordinates ? d.location.coordinates[1] : userLat;
    const dLng = d.location?.coordinates ? d.location.coordinates[0] : userLng;
    const dist = calcDistance(userLat, userLng, dLat, dLng);
    return {
      _id: d._id,
      fullName: d.fullName || d.name,
      bloodGroup: d.bloodGroup,
      isAvailable: d.isAvailable,
      isVerified: Boolean(d.isVerified),
      distanceKm: dist > 0 ? dist : 4.2,
      lastDonatedAt: d.lastDonatedAt,
    };
  }).filter(d => d.distanceKm <= maxRadiusKm).sort((a, b) => a.distanceKm - b.distanceKm);

  // 2. Search Compatible Available Blood Banks
  const bloodBankOrgs = await Organization.find({
    type: 'BLOOD_BANK',
    status: { $ne: 'SUSPENDED' },
  }).select('_id name address contactPhone officialEmail location status').exec();

  const bloodBanks = [];
  for (const bb of bloodBankOrgs) {
    const stockItems = await BloodInventory.find({
      organizationId: bb._id,
      bloodGroup: { $in: compatibleGroups },
      availableUnits: { $gt: 0 },
    });

    if (stockItems.length > 0) {
      const bLat = bb.location?.coordinates ? bb.location.coordinates[1] : userLat;
      const bLng = bb.location?.coordinates ? bb.location.coordinates[0] : userLng;
      const dist = calcDistance(userLat, userLng, bLat, bLng);

      const totalCompatibleStock = stockItems.reduce((sum, item) => sum + item.availableUnits, 0);

      bloodBanks.push({
        _id: bb._id,
        name: bb.name,
        contactPhone: bb.contactPhone,
        officialEmail: bb.officialEmail,
        address: bb.address?.street ? `${bb.address.street}, ${bb.address.city || ''}` : bb.name,
        distanceKm: dist > 0 ? dist : 5.2,
        availableStock: stockItems.map(i => ({ bloodGroup: i.bloodGroup, units: i.availableUnits })),
        totalCompatibleStock,
      });
    }
  }

  bloodBanks.sort((a, b) => a.distanceKm - b.distanceKm);

  return sendSuccess(res, {
    statusCode: 200,
    message: `Unified blood search completed for ${targetGroup}`,
    data: {
      requestedBloodGroup: targetGroup,
      unitsRequired: reqUnits,
      compatibleBloodGroups: compatibleGroups,
      donors,
      bloodBanks,
    },
  });
});

// GET /api/v1/organizations/blood-bank/requests — Blood Bank View Incoming Hospital Requests
const getBloodBankRequests = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user.organizationId) {
    return sendError(res, { statusCode: 403, message: 'Authenticated user is not linked to an Organization' });
  }

  const organization = await Organization.findById(user.organizationId);
  if (!organization || organization.type !== 'BLOOD_BANK') {
    return sendError(res, { statusCode: 403, message: 'Only Blood Bank accounts can access this queue' });
  }

  const requests = await BloodRequest.find({
    status: { $in: ['OPEN', 'HOSPITAL_VERIFIED', 'PATIENT_VERIFIED', 'MATCHING', 'VERIFICATION_PENDING'] },
  })
    .populate('requesterId', 'fullName name phone')
    .sort({ urgency: -1, createdAt: -1 })
    .exec();

  return sendSuccess(res, {
    statusCode: 200,
    message: `Retrieved ${requests.length} request(s) for blood bank fulfillment queue`,
    data: { requests },
  });
});

// POST /api/v1/organizations/blood-bank/requests/:id/fulfill — Blood Bank Fulfill Request from Stock
const fulfillBloodBankRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { units, notes } = req.body;
  const user = req.user;

  if (!user.organizationId) {
    return sendError(res, { statusCode: 403, message: 'Authenticated user is not linked to an Organization' });
  }

  const organization = await Organization.findById(user.organizationId);
  if (!organization || organization.type !== 'BLOOD_BANK') {
    return sendError(res, { statusCode: 403, message: 'Only Blood Bank accounts can fulfill blood requests' });
  }

  const bloodRequest = await BloodRequest.findById(id);
  if (!bloodRequest) {
    return sendError(res, { statusCode: 404, message: 'Blood request not found' });
  }

  const reqUnits = parseInt(units, 10) || bloodRequest.unitsRequired || 1;
  const bloodGroup = bloodRequest.bloodGroup;

  let inventoryItem = await BloodInventory.findOne({
    organizationId: organization._id,
    bloodGroup,
  });

  if (!inventoryItem || inventoryItem.availableUnits < reqUnits) {
    return sendError(res, {
      statusCode: 400,
      message: `Insufficient stock in ${organization.name} for blood group ${bloodGroup}. Available: ${inventoryItem ? inventoryItem.availableUnits : 0}`,
    });
  }

  inventoryItem.availableUnits -= reqUnits;
  inventoryItem.lastUpdatedBy = user._id;
  await inventoryItem.save();

  bloodRequest.status = 'FULFILLED';
  bloodRequest.fulfilledAt = new Date();
  bloodRequest.fulfilledByBloodBankId = organization._id;
  await bloodRequest.save();

  await AuditLog.create({
    performedBy: user._id,
    userRole: user.role,
    action: 'BLOOD_BANK_FULFILLED_REQUEST',
    entityType: 'BloodRequest',
    entityId: bloodRequest._id.toString(),
    newState: { status: 'FULFILLED', bloodBank: organization.name, unitsDispatched: reqUnits },
    reason: notes || `Blood Bank ${organization.name} dispatched ${reqUnits} unit(s) of ${bloodGroup}`,
  });

  return sendSuccess(res, {
    statusCode: 200,
    message: `Request fulfilled successfully. ${reqUnits} unit(s) of ${bloodGroup} dispatched from ${organization.name}.`,
    data: { request: bloodRequest, inventoryItem },
  });
});

module.exports = {
  registerOrganization,
  loginOrganization,
  getMyOrganization,
  getOrganizationRequestsQueue,
  createHospitalBloodRequest,
  verifyRequestByHospital,
  rejectRequestByHospital,
  confirmDonorByHospital,
  completeDonationByHospital,
  updateMyOrganization,
  setOrganizationPassword,
  getOrganizationAuditLogs,
  listPublicOrganizations,
  findBloodUnified,
  getBloodBankRequests,
  fulfillBloodBankRequest,
};
