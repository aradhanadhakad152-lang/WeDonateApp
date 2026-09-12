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

// GET /api/v1/admin/organizations — List Organizations
const getOrganizationsList = asyncHandler(async (req, res) => {
  const { status, type } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (type) filter.type = type;

  const organizations = await Organization.find(filter).sort({ createdAt: -1 });

  return sendSuccess(res, {
    statusCode: 200,
    message: `Retrieved ${organizations.length} organization(s)`,
    data: {
      organizations,
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

// GET /api/v1/admin/requests — Get All Blood Requests with Filters
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
    message: `Retrieved ${requests.length} blood request(s)`,
    data: { requests },
  });
});

// PATCH /api/v1/admin/requests/:id/verify — Admin Fallback Request Verification
const verifyRequestByAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason, action } = req.body;
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
    bloodRequest.rejectionReason = reason || 'Admin rejected request after phone verification';
    bloodRequest.verifiedBy = adminUser._id;
    bloodRequest.verificationSource = 'ADMIN';
    await bloodRequest.save();

    await AuditLog.create({
      performedBy: adminUser._id,
      userRole: adminUser.role,
      action: 'ADMIN_REJECTED_REQUEST',
      entityType: 'BloodRequest',
      entityId: bloodRequest._id.toString(),
      previousState: { status: previousState },
      newState: { status: 'REJECTED' },
      reason: reason || 'Admin rejected blood request',
    });

    return sendSuccess(res, {
      statusCode: 200,
      message: 'Blood request rejected by Admin',
      data: { request: bloodRequest },
    });
  }

  // Admin Approval (ADMIN_VERIFIED)
  bloodRequest.status = 'ADMIN_VERIFIED';
  bloodRequest.verifiedBy = adminUser._id;
  bloodRequest.verificationSource = 'ADMIN';
  bloodRequest.verificationNotes = reason || 'Hospital did not respond within timeout / Admin manual verification';
  await bloodRequest.save();

  // Create Audit Log
  await AuditLog.create({
    performedBy: adminUser._id,
    userRole: adminUser.role,
    action: 'ADMIN_VERIFIED_REQUEST',
    entityType: 'BloodRequest',
    entityId: bloodRequest._id.toString(),
    previousState: { status: previousState },
    newState: { status: 'ADMIN_VERIFIED' },
    reason: reason || 'Hospital timeout fallback / Manual Admin Verification',
  });

  logger.info(`BloodRequest ${bloodRequest._id} VERIFIED by Admin ${adminUser._id}`);

  // Trigger targeted donor matching engine
  try {
    const { findAndMatchNearbyDonors } = require('../services/donorMatchingService');
    await findAndMatchNearbyDonors(bloodRequest._id);
  } catch (matchErr) {
    logger.warn(`Donor matching warning after admin verification: ${matchErr.message}`);
  }

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Blood request verified by Admin (ADMIN_VERIFIED). Targeted donor matching initiated.',
    data: {
      request: bloodRequest,
    },
  });
});

// GET /api/v1/admin/audit-logs — Query System Audit Trail
const getAuditLogs = asyncHandler(async (req, res) => {
  const { entityType, action, limit = 100 } = req.query;
  const filter = {};
  if (entityType) filter.entityType = entityType;
  if (action) filter.action = action;

  const logs = await AuditLog.find(filter)
    .populate('performedBy', 'fullName name phone role email')
    .sort({ createdAt: -1 })
    .limit(parseInt(limit, 10))
    .exec();

  return sendSuccess(res, {
    statusCode: 200,
    message: `Retrieved ${logs.length} audit log record(s)`,
    data: {
      logs,
    },
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
  updateOrganizationStatus,
  getPendingRequestsForAdmin,
  getAllRequestsForAdmin,
  verifyRequestByAdmin,
  getAuditLogs,
  getWhatsAppConfigStatusController,
};
