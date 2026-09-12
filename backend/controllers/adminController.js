'use strict';

const User = require('../models/User');
const Organization = require('../models/Organization');
const BloodRequest = require('../models/BloodRequest');
const DonationCamp = require('../models/DonationCamp');
const CampRegistration = require('../models/CampRegistration');
const BloodInventory = require('../models/BloodInventory');
const FinancialDonation = require('../models/FinancialDonation');
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
    { $match: { transactionStatus: 'SUCCESS' } },
    { $group: { _id: null, totalAmount: { $sum: '$amount' } } },
  ]);
  const totalDonationFunding = fundingAggregation.length > 0 ? fundingAggregation[0].totalAmount : 0;

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
      },
    },
  });
});

// GET /api/v1/admin/organizations — List Organizations with status filter
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
    .sort({ createdAt: 1 }) // Oldest unverified requests first
    .exec();

  return sendSuccess(res, {
    statusCode: 200,
    message: `Retrieved ${pendingRequests.length} pending request(s) awaiting verification`,
    data: {
      requests: pendingRequests,
    },
  });
});

// PATCH /api/v1/admin/requests/:id/verify — Admin Fallback Request Verification
const verifyRequestByAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason, action } = req.body; // action: 'APPROVE' or 'REJECT'
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
  const { entityType, action, limit = 50 } = req.query;
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

module.exports = {
  getAdminDashboardMetrics,
  getOrganizationsList,
  updateOrganizationStatus,
  getPendingRequestsForAdmin,
  verifyRequestByAdmin,
  getAuditLogs,
};
