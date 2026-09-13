'use strict';

const User = require('../models/User');
const Organization = require('../models/Organization');
const BloodRequest = require('../models/BloodRequest');
const DonationCamp = require('../models/DonationCamp');
const CampRegistration = require('../models/CampRegistration');
const BloodInventory = require('../models/BloodInventory');
const FinancialDonation = require('../models/FinancialDonation');
const FundingCampaign = require('../models/FundingCampaign');
const AuditLog = require('../models/AuditLog');
const mongoose = require('mongoose');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../utils/logger');

// GET /api/v1/admin/dashboard — Real-Time Platform Analytics
const getAdminDashboardMetrics = asyncHandler(async (req, res) => {
  const totalUsers = await User.countDocuments();
  const totalDonors = await User.countDocuments({ isDonor: true });
  const activeDonors = await User.countDocuments({ isDonor: true, isAvailable: true, accountStatus: 'ACTIVE' });

  const totalHospitals = await Organization.countDocuments({ type: 'HOSPITAL' });
  const totalBloodBanks = await Organization.countDocuments({ type: 'BLOOD_BANK' });
  const pendingOrgVerifications = await Organization.countDocuments({ status: 'PENDING_VERIFICATION' });

  const totalBloodRequests = await BloodRequest.countDocuments();
  const pendingRequestVerifications = await BloodRequest.countDocuments({ status: 'VERIFICATION_PENDING' });
  const verifiedRequests = await BloodRequest.countDocuments({ status: { $in: ['HOSPITAL_VERIFIED', 'ADMIN_VERIFIED', 'MATCHING'] } });
  const fulfilledRequests = await BloodRequest.countDocuments({ status: 'FULFILLED' });
  const expiredRequests = await BloodRequest.countDocuments({ status: 'EXPIRED' });

  const activeCamps = await DonationCamp.countDocuments({ status: { $in: ['PUBLISHED', 'ONGOING'] } });
  const totalCampRegistrations = await CampRegistration.countDocuments();

  const fundingAggregation = await FinancialDonation.aggregate([
    { $group: { _id: null, totalAmount: { $sum: '$amount' } } },
  ]);
  const totalDonationFunding = fundingAggregation.length > 0 ? fundingAggregation[0].totalAmount : 0;
  const totalCampaigns = await FundingCampaign.countDocuments();

  const recentAuditActivity = await AuditLog.find()
    .populate('performedBy', 'fullName name role email')
    .sort({ createdAt: -1 })
    .limit(10)
    .exec();

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Admin dashboard metrics retrieved successfully',
    data: {
      metrics: {
        totalUsers,
        totalDonors,
        activeDonors,
        totalHospitals,
        totalBloodBanks,
        pendingOrgVerifications,
        totalBloodRequests,
        pendingRequestVerifications,
        verifiedRequests,
        fulfilledRequests,
        expiredRequests,
        activeCamps,
        totalCampRegistrations,
        totalDonationFunding,
        totalCampaigns,
      },
      recentActivity: recentAuditActivity,
    },
  });
});

// GET /api/v1/admin/users — List Users & Donors for Operational Admin View
const getUsersList = asyncHandler(async (req, res) => {
  const { role, isDonor, bloodGroup, status, city } = req.query;
  const filter = {};
  if (role) filter.role = role;
  if (isDonor !== undefined) filter.isDonor = isDonor === 'true';
  if (bloodGroup) filter.bloodGroup = bloodGroup;
  if (status) filter.accountStatus = status;
  if (city) filter['location.city'] = new RegExp(city, 'i');

  const users = await User.find(filter)
    .select('-refreshTokenHashes -password')
    .sort({ createdAt: -1 })
    .exec();

  return sendSuccess(res, {
    statusCode: 200,
    message: `Retrieved ${users.length} user record(s)`,
    data: { users },
  });
});

// PATCH /api/v1/admin/users/:id/status — Activate / Deactivate User Account
const updateUserStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { accountStatus, reason } = req.body;
  const adminUser = req.user;

  if (!['ACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION'].includes(accountStatus)) {
    return sendError(res, {
      statusCode: 400,
      message: 'Account status must be ACTIVE, SUSPENDED, or PENDING_VERIFICATION',
    });
  }

  const userDoc = await User.findById(id);
  if (!userDoc) {
    return sendError(res, {
      statusCode: 404,
      message: 'User account not found',
    });
  }

  const previousState = userDoc.accountStatus;
  userDoc.accountStatus = accountStatus;
  userDoc.isActive = accountStatus === 'ACTIVE';

  await userDoc.save();

  // Audit Log
  await AuditLog.create({
    performedBy: adminUser._id,
    userRole: adminUser.role,
    action: 'USER_STATUS_CHANGED',
    entityType: 'User',
    entityId: userDoc._id.toString(),
    previousState: { accountStatus: previousState },
    newState: { accountStatus },
    reason: reason || `Admin updated account status to ${accountStatus}`,
  });

  return sendSuccess(res, {
    statusCode: 200,
    message: `User account status updated to ${accountStatus}`,
    data: { user: userDoc.toProfileJSON() },
  });
});

// PATCH /api/v1/admin/users/:id/availability — Update Donor Availability
const updateUserAvailability = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { isAvailable, donorStatus, reason } = req.body;
  const adminUser = req.user;

  const userDoc = await User.findById(id);
  if (!userDoc) {
    return sendError(res, {
      statusCode: 404,
      message: 'User not found',
    });
  }

  const previousState = { isAvailable: userDoc.isAvailable, donorStatus: userDoc.donorStatus };
  if (isAvailable !== undefined) userDoc.isAvailable = isAvailable;
  if (donorStatus !== undefined) userDoc.donorStatus = donorStatus;

  await userDoc.save();

  // Audit Log
  await AuditLog.create({
    performedBy: adminUser._id,
    userRole: adminUser.role,
    action: 'USER_AVAILABILITY_CHANGED',
    entityType: 'User',
    entityId: userDoc._id.toString(),
    previousState,
    newState: { isAvailable: userDoc.isAvailable, donorStatus: userDoc.donorStatus },
    reason: reason || 'Admin updated donor availability',
  });

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Donor availability updated',
    data: { user: userDoc.toProfileJSON() },
  });
});

function generateTemporaryPassword() {
  const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lowercase = 'abcdefghijkmnopqrstuvwxyz';
  const numbers = '23456789';
  const symbols = '!@#$%&*';

  const getRandomChar = (str) => str.charAt(Math.floor(Math.random() * str.length));

  let pass = '';
  pass += getRandomChar(uppercase);
  pass += getRandomChar(lowercase);
  pass += getRandomChar(numbers);
  pass += getRandomChar(symbols);

  const all = uppercase + lowercase + numbers + symbols;
  for (let i = 0; i < 8; i++) {
    pass += getRandomChar(all);
  }

  return pass.split('').sort(() => 0.5 - Math.random()).join('');
}

// GET /api/v1/admin/organizations — List Organizations with Search, Filter & Account Status
const getOrganizationsList = asyncHandler(async (req, res) => {
  const { status, type, city, search } = req.query;
  const filter = {};
  if (status && status !== 'all') filter.status = status;
  if (type && type !== 'all') filter.type = type;
  if (city && city.trim().length > 0) filter['address.city'] = new RegExp(city.trim(), 'i');

  if (search && search.trim().length > 0) {
    const s = search.trim();
    if (/^[0-9a-fA-F]{24}$/.test(s)) {
      filter._id = s;
    } else {
      const searchRegex = new RegExp(s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), 'i');
      filter.$or = [
        { name: searchRegex },
        { 'address.city': searchRegex },
        { officialEmail: searchRegex },
        { registrationLicense: searchRegex },
      ];
    }
  }

  const rawOrgs = await Organization.find(filter).sort({ createdAt: -1 });

  // Attach linked manager User account status for each organization
  const organizations = await Promise.all(
    rawOrgs.map(async (org) => {
      const orgJson = org.toJSON();
      const staffUser = await User.findOne({ organizationId: org._id }).select('email phone role accountStatus isActive createdAt');
      orgJson.account = staffUser
        ? {
            hasAccount: true,
            userId: staffUser._id,
            loginId: staffUser.email || staffUser.phone,
            email: staffUser.email,
            phone: staffUser.phone,
            role: staffUser.role,
            accountStatus: staffUser.accountStatus,
            isActive: staffUser.isActive,
            createdAt: staffUser.createdAt,
          }
        : {
            hasAccount: false,
            accountStatus: 'NO_ACCOUNT',
          };
      return orgJson;
    })
  );

  return sendSuccess(res, {
    statusCode: 200,
    message: `Retrieved ${organizations.length} organization(s)`,
    data: {
      organizations,
    },
  });
});

// POST /api/v1/admin/organizations/:id/account — Create Manager Account for Organization
const createOrganizationAccount = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { loginId, password } = req.body;
  const adminUser = req.user;

  if (!['ADMIN', 'SUPER_ADMIN'].includes(adminUser.role)) {
    return sendError(res, {
      statusCode: 403,
      message: 'Access denied: Admin privileges required to manage organization accounts',
    });
  }

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return sendError(res, {
      statusCode: 400,
      message: 'Invalid organization ID format',
    });
  }

  const organization = await Organization.findById(id);
  if (!organization) {
    return sendError(res, {
      statusCode: 404,
      message: 'Organization not found',
    });
  }

  // Duplicate Check: Check if manager account already exists for this organization
  const existingAccount = await User.findOne({ organizationId: organization._id });
  if (existingAccount) {
    return sendError(res, {
      statusCode: 409,
      message: 'Account already exists for this organization',
      data: {
        organizationId: organization._id,
        organizationName: organization.name,
        accountStatus: existingAccount.accountStatus,
        loginId: existingAccount.email || existingAccount.phone,
        role: existingAccount.role,
        userId: existingAccount._id,
      },
    });
  }

  // Determine Login ID (Email or Phone)
  let finalLoginId = (loginId || '').trim();
  if (!finalLoginId) {
    finalLoginId = organization.officialEmail || organization.contactPhone;
  }
  if (!finalLoginId) {
    return sendError(res, {
      statusCode: 400,
      message: 'Login ID (email or phone) is required for organization account creation',
    });
  }

  // Determine password
  let tempPassword = (password || '').trim();
  if (!tempPassword) {
    tempPassword = generateTemporaryPassword();
  } else if (tempPassword.length < 8) {
    return sendError(res, {
      statusCode: 400,
      message: 'Password must be at least 8 characters long',
    });
  }

  // Derivation of Role strictly based on organization.type
  const role = organization.type === 'HOSPITAL' ? 'HOSPITAL_MANAGER' : 'BLOOD_BANK_MANAGER';
  const isEmail = finalLoginId.includes('@');

  const staffUser = new User({
    firebaseUid: `org_mgr_${organization._id}_${Date.now()}`,
    fullName: organization.authorizedPerson?.name || organization.name,
    name: organization.name,
    email: isEmail ? finalLoginId.toLowerCase() : organization.officialEmail.toLowerCase(),
    phone: !isEmail ? finalLoginId : (organization.authorizedPerson?.phone || organization.contactPhone),
    role,
    organizationId: organization._id,
    accountStatus: 'ACTIVE',
    isActive: true,
    isVerified: true,
    password: tempPassword, // Will be bcrypt-hashed in User pre-save hook
  });

  await staffUser.save();

  // Audit Log
  await AuditLog.create({
    performedBy: adminUser._id,
    userRole: adminUser.role,
    action: 'ORGANIZATION_ACCOUNT_CREATED',
    entityType: 'Organization',
    entityId: organization._id.toString(),
    newState: {
      organizationName: organization.name,
      role,
      loginId: finalLoginId,
      accountStatus: 'ACTIVE',
    },
    reason: `Admin created ${role} account for '${organization.name}'`,
  });

  logger.info(`Admin ${adminUser._id} created ${role} account for Organization ${organization._id}`);

  return sendSuccess(res, {
    statusCode: 201,
    message: `Login account created successfully for '${organization.name}'`,
    data: {
      organizationId: organization._id,
      organizationName: organization.name,
      loginId: finalLoginId,
      role,
      accountStatus: staffUser.accountStatus,
      temporaryPassword: tempPassword, // Exposed ONCE in initial response payload
    },
  });
});

// POST /api/v1/admin/organizations/:id/account/reset-password — Reset Organization Password
const resetOrganizationAccountPassword = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;
  const adminUser = req.user;

  if (!['ADMIN', 'SUPER_ADMIN'].includes(adminUser.role)) {
    return sendError(res, {
      statusCode: 403,
      message: 'Access denied: Admin privileges required to reset organization password',
    });
  }

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return sendError(res, {
      statusCode: 400,
      message: 'Invalid organization ID format',
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
      message: 'No login account exists for this organization. Please create an account first.',
    });
  }

  let tempPassword = (newPassword || '').trim();
  if (!tempPassword) {
    tempPassword = generateTemporaryPassword();
  } else if (tempPassword.length < 8) {
    return sendError(res, {
      statusCode: 400,
      message: 'New password must be at least 8 characters long',
    });
  }

  // Update password & invalidate active sessions
  staffUser.password = tempPassword;
  staffUser.refreshTokenHashes = []; // Invalidate existing refresh tokens
  await staffUser.save(); // Hashes password via User pre-save hook

  // Audit Log
  await AuditLog.create({
    performedBy: adminUser._id,
    userRole: adminUser.role,
    action: 'ORGANIZATION_ACCOUNT_PASSWORD_RESET',
    entityType: 'Organization',
    entityId: organization._id.toString(),
    newState: { organizationName: organization.name },
    reason: `Admin reset password for organization '${organization.name}'`,
  });

  logger.info(`Admin ${adminUser._id} reset password for Organization ${organization._id}`);

  return sendSuccess(res, {
    statusCode: 200,
    message: `Password reset successfully for '${organization.name}'`,
    data: {
      organizationId: organization._id,
      organizationName: organization.name,
      loginId: staffUser.email || staffUser.phone,
      temporaryPassword: tempPassword, // Returned ONCE in response
    },
  });
});

// PATCH /api/v1/admin/organizations/:id/account-status — Activate/Suspend Organization Account
const updateOrganizationAccountStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { accountStatus, reason } = req.body;
  const adminUser = req.user;

  if (!['ADMIN', 'SUPER_ADMIN'].includes(adminUser.role)) {
    return sendError(res, {
      statusCode: 403,
      message: 'Access denied: Admin privileges required to update organization account status',
    });
  }

  if (!['ACTIVE', 'SUSPENDED', 'INACTIVE'].includes(accountStatus)) {
    return sendError(res, {
      statusCode: 400,
      message: 'accountStatus must be ACTIVE, SUSPENDED, or INACTIVE',
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
      message: 'No login account exists for this organization',
    });
  }

  const previousStatus = staffUser.accountStatus;
  staffUser.accountStatus = accountStatus;

  if (accountStatus === 'SUSPENDED') {
    staffUser.isActive = false;
    staffUser.refreshTokenHashes = []; // Revoke active sessions
    organization.status = 'SUSPENDED';
    await organization.save();
  } else if (accountStatus === 'ACTIVE') {
    staffUser.isActive = true;
    if (organization.status === 'SUSPENDED') {
      organization.status = 'APPROVED';
      await organization.save();
    }
  }

  await staffUser.save();

  const actionName = accountStatus === 'ACTIVE' ? 'ORGANIZATION_ACCOUNT_ACTIVATED' : 'ORGANIZATION_ACCOUNT_SUSPENDED';

  // Audit Log
  await AuditLog.create({
    performedBy: adminUser._id,
    userRole: adminUser.role,
    action: actionName,
    entityType: 'Organization',
    entityId: organization._id.toString(),
    previousState: { accountStatus: previousStatus },
    newState: { accountStatus, organizationStatus: organization.status },
    reason: reason || `Admin set account status to ${accountStatus}`,
  });

  logger.info(`Admin ${adminUser._id} set Organization ${organization._id} account status to ${accountStatus}`);

  return sendSuccess(res, {
    statusCode: 200,
    message: `Organization account status updated to ${accountStatus}`,
    data: {
      organizationId: organization._id,
      organizationName: organization.name,
      accountStatus: staffUser.accountStatus,
      organizationStatus: organization.status,
    },
  });
});

// PATCH /api/v1/admin/organizations/:id/status — Approve/Reject/Suspend Organization
const updateOrganizationStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, rejectionReason } = req.body;
  const adminUser = req.user;

  if (!['APPROVED', 'REJECTED', 'SUSPENDED'].includes(status)) {
    return sendError(res, {
      statusCode: 400,
      message: 'Status must be APPROVED, REJECTED, or SUSPENDED',
    });
  }

  const organization = await Organization.findById(id);
  if (!organization) {
    return sendError(res, {
      statusCode: 404,
      message: 'Organization not found',
    });
  }

  const previousState = organization.status;
  organization.status = status;
  if (status === 'APPROVED') {
    organization.verifiedBy = adminUser._id;
    organization.verifiedAt = new Date();
  } else if (status === 'REJECTED') {
    organization.rejectionReason = rejectionReason || 'Failed license/documentation check';
  }

  await organization.save();

  // Audit Log
  await AuditLog.create({
    performedBy: adminUser._id,
    userRole: adminUser.role,
    action: `ADMIN_${status}_ORGANIZATION`,
    entityType: 'Organization',
    entityId: organization._id.toString(),
    previousState: { status: previousState },
    newState: { status, rejectionReason },
    reason: rejectionReason || `Admin set status to ${status}`,
  });

  logger.info(`Admin ${adminUser._id} set Organization ${organization._id} status to ${status}`);

  return sendSuccess(res, {
    statusCode: 200,
    message: `Organization status updated to ${status}`,
    data: {
      organization,
    },
  });
});

// GET /api/v1/admin/requests/pending — Fallback Verification Queue for Admin
const getPendingRequestsForAdmin = asyncHandler(async (req, res) => {
  const pendingRequests = await BloodRequest.find({ status: 'VERIFICATION_PENDING' })
    .populate('requesterId', 'fullName name phone bloodGroup email')
    .populate('targetOrganizationId', 'name contactPhone officialEmail')
    .sort({ createdAt: 1 })
    .exec();

  return sendSuccess(res, {
    statusCode: 200,
    message: `Retrieved ${pendingRequests.length} pending request(s) awaiting verification`,
    data: {
      requests: pendingRequests,
    },
  });
});

// GET /api/v1/admin/requests — Get All Requests Across All Organizations
const getAllRequestsForAdmin = asyncHandler(async (req, res) => {
  const { status, bloodGroup, urgency } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (bloodGroup) filter.bloodGroup = bloodGroup;
  if (urgency) filter.urgency = urgency;

  const requests = await BloodRequest.find(filter)
    .populate('requesterId', 'fullName name phone bloodGroup email')
    .populate('targetOrganizationId', 'name contactPhone officialEmail')
    .sort({ createdAt: -1 })
    .exec();

  return sendSuccess(res, {
    statusCode: 200,
    message: `Retrieved ${requests.length} request(s) for platform admin`,
    data: {
      requests,
    },
  });
});

// PATCH /api/v1/admin/requests/:id/verify — Admin Fallback Manual Request Verification
const verifyRequestByAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { action, reason } = req.body;
  const adminUser = req.user;

  const bloodRequest = await BloodRequest.findById(id);
  if (!bloodRequest) {
    return sendError(res, {
      statusCode: 404,
      message: 'Blood request not found',
    });
  }

  const previousState = bloodRequest.status;
  if (action === 'REJECT') {
    bloodRequest.status = 'REJECTED';
    bloodRequest.rejectionReason = reason || 'Admin manual rejection';
    await bloodRequest.save();

    await AuditLog.create({
      performedBy: adminUser._id,
      userRole: adminUser.role,
      action: 'ADMIN_REJECTED_REQUEST',
      entityType: 'BloodRequest',
      entityId: bloodRequest._id.toString(),
      previousState: { status: previousState },
      newState: { status: 'REJECTED' },
      reason: reason || 'Admin rejected request',
    });

    return sendSuccess(res, {
      statusCode: 200,
      message: 'Blood request rejected by platform admin',
      data: { request: bloodRequest },
    });
  }

  bloodRequest.status = 'ADMIN_VERIFIED';
  bloodRequest.verifiedBy = adminUser._id;
  bloodRequest.verificationSource = 'ADMIN_MANUAL';
  bloodRequest.verificationNotes = reason || 'Admin verified patient emergency requirement';
  await bloodRequest.save();

  await AuditLog.create({
    performedBy: adminUser._id,
    userRole: adminUser.role,
    action: 'ADMIN_VERIFIED_REQUEST',
    entityType: 'BloodRequest',
    entityId: bloodRequest._id.toString(),
    previousState: { status: previousState },
    newState: { status: 'ADMIN_VERIFIED' },
    reason: reason || 'Admin verified request',
  });

  // Trigger matching engine
  try {
    const { findAndMatchNearbyDonors } = require('../services/donorMatchingService');
    await findAndMatchNearbyDonors(bloodRequest._id);
  } catch (matchErr) {
    logger.warn(`Donor matching warning after admin verification: ${matchErr.message}`);
  }

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Blood request verified by admin. Donor matching initiated.',
    data: { request: bloodRequest },
  });
});

// GET /api/v1/admin/audit-logs — System Audit Logs
const getAuditLogs = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit || 100, 10);
  const logs = await AuditLog.find({})
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

// GET /api/v1/admin/whatsapp-config — Inspect WhatsApp service configuration safely
const getWhatsAppConfigStatusController = asyncHandler(async (req, res) => {
  const { getWhatsAppConfigStatus } = require('../services/whatsappService');
  const status = getWhatsAppConfigStatus();

  return sendSuccess(res, {
    statusCode: 200,
    message: 'WhatsApp service configuration status retrieved',
    data: {
      whatsappConfig: status,
    },
  });
});

module.exports = {
  getAdminDashboardMetrics,
  getUsersList,
  updateUserStatus,
  updateUserAvailability,
  getOrganizationsList,
  createOrganizationAccount,
  resetOrganizationAccountPassword,
  updateOrganizationAccountStatus,
  updateOrganizationStatus,
  getPendingRequestsForAdmin,
  getAllRequestsForAdmin,
  verifyRequestByAdmin,
  getAuditLogs,
  getWhatsAppConfigStatusController,
};
