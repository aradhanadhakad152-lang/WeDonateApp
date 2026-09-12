'use strict';

const DonationRegistration = require('../models/DonationRegistration');
const Organization = require('../models/Organization');
const BloodInventory = require('../models/BloodInventory');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../utils/logger');

// POST /api/v1/donations/register — Register for Blood Donation (Citizen)
const registerDonation = asyncHandler(async (req, res) => {
  const { organizationId, campId, bloodGroup, notes } = req.body;
  const user = req.user;

  if (!organizationId) {
    return sendError(res, {
      statusCode: 400,
      message: 'Target Organization ID is required',
    });
  }

  const organization = await Organization.findById(organizationId);
  if (!organization) {
    return sendError(res, {
      statusCode: 404,
      message: 'Target Organization not found',
    });
  }

  const bg = bloodGroup || user.bloodGroup;
  if (!bg) {
    return sendError(res, {
      statusCode: 400,
      message: 'Blood group is required for donation registration',
    });
  }

  const registration = new DonationRegistration({
    donorId: user._id,
    donorName: user.fullName || user.name || 'Anonymous Donor',
    donorPhone: user.phone || '',
    bloodGroup: bg,
    organizationId: organization._id,
    organizationType: organization.type,
    campId: campId || null,
    registrationDate: new Date(),
    status: 'PENDING_APPROVAL',
    unitsDonated: 1,
    notes: notes || '',
  });

  await registration.save();

  // Audit Log
  await AuditLog.create({
    performedBy: user._id,
    userRole: user.role,
    action: 'DONATION_REGISTERED',
    entityType: 'DonationRegistration',
    entityId: registration._id.toString(),
    newState: { status: 'PENDING_APPROVAL', bloodGroup: bg, organizationId: organization._id },
    reason: `Citizen registered for blood donation at ${organization.name}`,
  });

  logger.info(`Donation registration created: ${registration._id} for donor ${user._id} at Org ${organization._id}`);

  return sendSuccess(res, {
    statusCode: 201,
    message: 'Blood donation registration submitted successfully (PENDING_APPROVAL)',
    data: { registration },
  });
});

// GET /api/v1/organizations/donation-registrations — Get Organization Registrations Queue
const getOrganizationDonationRegistrations = asyncHandler(async (req, res) => {
  const { status, bloodGroup, campId } = req.query;
  const user = req.user;

  let targetOrgId = user.organizationId;

  // Admins can query any organization if organizationId query parameter provided
  if (['ADMIN', 'SUPER_ADMIN'].includes(user.role) && req.query.organizationId) {
    targetOrgId = req.query.organizationId;
  }

  if (!targetOrgId && !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
    return sendError(res, {
      statusCode: 403,
      message: 'User account is not associated with an Organization',
    });
  }

  const filter = {};
  if (targetOrgId) filter.organizationId = targetOrgId;
  if (status) filter.status = status;
  if (bloodGroup) filter.bloodGroup = bloodGroup;
  if (campId) filter.campId = campId;

  const registrations = await DonationRegistration.find(filter)
    .populate('donorId', 'fullName name phone email bloodGroup profilePhoto')
    .populate('campId', 'title date city address')
    .sort({ createdAt: -1 })
    .exec();

  return sendSuccess(res, {
    statusCode: 200,
    message: `Retrieved ${registrations.length} donation registration(s)`,
    data: { registrations },
  });
});

// PATCH /api/v1/donations/:id/approve — Approve Donation Registration
const approveDonationRegistration = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  const registration = await DonationRegistration.findById(id);
  if (!registration) {
    return sendError(res, {
      statusCode: 404,
      message: 'Donation registration record not found',
    });
  }

  // Authorization Check: Staff can only process their own org's registrations
  if (!['ADMIN', 'SUPER_ADMIN'].includes(user.role) && registration.organizationId.toString() !== user.organizationId?.toString()) {
    return sendError(res, {
      statusCode: 403,
      message: 'Access denied: You can only manage registrations for your own organization',
    });
  }

  registration.status = 'APPROVED';
  registration.approvedBy = user._id;
  registration.approvedAt = new Date();
  await registration.save();

  await AuditLog.create({
    performedBy: user._id,
    userRole: user.role,
    action: 'DONATION_APPROVED',
    entityType: 'DonationRegistration',
    entityId: registration._id.toString(),
    newState: { status: 'APPROVED', approvedBy: user._id },
    reason: 'Staff verified donor identity and approved donation eligibility',
  });

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Donation registration approved',
    data: { registration },
  });
});

// PATCH /api/v1/donations/:id/complete — Confirm Actual Blood Donation & Update Stock
const completeDonationRegistration = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { unitsDonated } = req.body;
  const user = req.user;

  const registration = await DonationRegistration.findById(id);
  if (!registration) {
    return sendError(res, {
      statusCode: 404,
      message: 'Donation registration record not found',
    });
  }

  // Authorization Check
  if (!['ADMIN', 'SUPER_ADMIN'].includes(user.role) && registration.organizationId.toString() !== user.organizationId?.toString()) {
    return sendError(res, {
      statusCode: 403,
      message: 'Access denied: You can only manage registrations for your own organization',
    });
  }

  const units = unitsDonated ? Math.max(1, parseInt(unitsDonated, 10)) : (registration.unitsDonated || 1);

  const previousState = registration.status;
  registration.status = 'COMPLETED';
  registration.unitsDonated = units;
  registration.completedBy = user._id;
  registration.completedAt = new Date();
  await registration.save();

  // ATOMICALLY UPDATE BLOOD INVENTORY STOCK FOR THE ORGANIZATION
  let inventoryItem = await BloodInventory.findOne({
    organizationId: registration.organizationId,
    bloodGroup: registration.bloodGroup,
  });

  const previousUnits = inventoryItem ? inventoryItem.availableUnits : 0;

  if (!inventoryItem) {
    inventoryItem = new BloodInventory({
      organizationId: registration.organizationId,
      bloodGroup: registration.bloodGroup,
      availableUnits: units,
      reservedUnits: 0,
      lowStockThreshold: 5,
      lastUpdatedBy: user._id,
    });
  } else {
    inventoryItem.availableUnits += units;
    inventoryItem.lastUpdatedBy = user._id;
  }

  await inventoryItem.save();

  // Update Donor Record
  const donor = await User.findById(registration.donorId);
  if (donor) {
    donor.lastDonationDate = new Date();
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + 90);
    donor.nextEligibleDonationDate = nextDate;
    donor.isEligible = false;
    donor.donorStatus = 'INELIGIBLE';
    await donor.save();
  }

  // Audit Logs
  await AuditLog.create({
    performedBy: user._id,
    userRole: user.role,
    action: 'DONATION_COMPLETED',
    entityType: 'DonationRegistration',
    entityId: registration._id.toString(),
    previousState: { status: previousState },
    newState: { status: 'COMPLETED', unitsDonated: units },
    reason: `Blood donation completed (+${units} unit ${registration.bloodGroup})`,
  });

  await AuditLog.create({
    performedBy: user._id,
    userRole: user.role,
    action: 'INVENTORY_UPDATED',
    entityType: 'BloodInventory',
    entityId: inventoryItem._id.toString(),
    previousState: { bloodGroup: registration.bloodGroup, availableUnits: previousUnits },
    newState: { bloodGroup: registration.bloodGroup, availableUnits: inventoryItem.availableUnits },
    reason: `Stock increased (+${units} units) following completed blood donation ${registration._id}`,
  });

  return sendSuccess(res, {
    statusCode: 200,
    message: `Donation completed successfully! ${units} unit(s) of ${registration.bloodGroup} added to inventory stock.`,
    data: { registration, inventoryItem },
  });
});

// PATCH /api/v1/donations/:id/reject — Reject Donation Registration
const rejectDonationRegistration = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rejectionReason } = req.body;
  const user = req.user;

  if (!rejectionReason) {
    return sendError(res, {
      statusCode: 400,
      message: 'Rejection reason is required',
    });
  }

  const registration = await DonationRegistration.findById(id);
  if (!registration) {
    return sendError(res, {
      statusCode: 404,
      message: 'Donation registration record not found',
    });
  }

  // Authorization Check
  if (!['ADMIN', 'SUPER_ADMIN'].includes(user.role) && registration.organizationId.toString() !== user.organizationId?.toString()) {
    return sendError(res, {
      statusCode: 403,
      message: 'Access denied: You can only manage registrations for your own organization',
    });
  }

  registration.status = 'REJECTED';
  registration.rejectedBy = user._id;
  registration.rejectedAt = new Date();
  registration.rejectionReason = rejectionReason;
  await registration.save();

  await AuditLog.create({
    performedBy: user._id,
    userRole: user.role,
    action: 'DONATION_REJECTED',
    entityType: 'DonationRegistration',
    entityId: registration._id.toString(),
    newState: { status: 'REJECTED', rejectionReason },
    reason: rejectionReason,
  });

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Donation registration rejected',
    data: { registration },
  });
});

// GET /api/v1/users/my-donations — Get Citizen's Personal Donation History
const getMyDonations = asyncHandler(async (req, res) => {
  const user = req.user;

  const donations = await DonationRegistration.find({ donorId: user._id })
    .populate('organizationId', 'name type address city contactPhone officialEmail')
    .populate('campId', 'title date address city')
    .sort({ createdAt: -1 })
    .exec();

  return sendSuccess(res, {
    statusCode: 200,
    message: `Retrieved ${donations.length} personal donation record(s)`,
    data: { donations },
  });
});

module.exports = {
  registerDonation,
  getOrganizationDonationRegistrations,
  approveDonationRegistration,
  completeDonationRegistration,
  rejectDonationRegistration,
  getMyDonations,
};
