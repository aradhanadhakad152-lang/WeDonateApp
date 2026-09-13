'use strict';

const DonationCamp = require('../models/DonationCamp');
const CampRegistration = require('../models/CampRegistration');
const BloodInventory = require('../models/BloodInventory');
const User = require('../models/User');
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
    description: description || title,
    organizationId: orgId,
    date: new Date(date),
    startTime: startTime || '09:00 AM',
    endTime: endTime || '05:00 PM',
    address: address || 'Main Center',
    city: city || 'New Delhi',
    state: state || 'Delhi',
    contactPhone: contactPhone || req.user.phone || '+919999999999',
    contactEmail: contactEmail || req.user.email || 'org@wedonate.org',
    location: {
      type: 'Point',
      coordinates: [lng, lat],
    },
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

// PATCH /api/v1/camps/:id/status — Approve / Update Camp Status
const updateCampStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const user = req.user;

  if (!['PUBLISHED', 'ONGOING', 'COMPLETED', 'CANCELLED', 'PENDING_APPROVAL'].includes(status)) {
    return sendError(res, { statusCode: 400, message: 'Invalid status' });
  }

  const camp = await DonationCamp.findById(id);
  if (!camp) {
    return sendError(res, { statusCode: 404, message: 'Donation camp not found' });
  }

  const previousStatus = camp.status;
  camp.status = status;
  await camp.save();

  await AuditLog.create({
    performedBy: user._id,
    userRole: user.role,
    action: 'CAMP_STATUS_UPDATED',
    entityType: 'DonationCamp',
    entityId: camp._id.toString(),
    previousState: { status: previousStatus },
    newState: { status },
    reason: `Camp status updated to ${status}`,
  });

  return sendSuccess(res, {
    statusCode: 200,
    message: `Camp status updated to ${status}`,
    data: { camp },
  });
});

// PATCH /api/v1/camps/registrations/:registrationId/check-in — Check In Registered Donor at Camp
const checkInCampRegistration = asyncHandler(async (req, res) => {
  const { registrationId } = req.params;

  const registration = await CampRegistration.findById(registrationId).populate('campId');
  if (!registration) {
    return sendError(res, { statusCode: 404, message: 'Camp registration record not found' });
  }

  registration.status = 'CHECKED_IN';
  registration.checkInAt = new Date();
  registration.attendedAt = new Date();
  await registration.save();

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Donor checked in successfully',
    data: { registration },
  });
});

// PATCH /api/v1/camps/registrations/:registrationId/status — Mark Camp Donor Status (DONATED, REJECTED, etc.)
const updateCampRegistrationStatus = asyncHandler(async (req, res) => {
  const { registrationId } = req.params;
  const { status, unitsDonated, rejectionReason } = req.body;
  const user = req.user;

  if (!['DONATED', 'DID_NOT_DONATE', 'REJECTED', 'CHECKED_IN', 'REGISTERED'].includes(status)) {
    return sendError(res, { statusCode: 400, message: 'Invalid registration status' });
  }

  const registration = await CampRegistration.findById(registrationId).populate('campId');
  if (!registration) {
    return sendError(res, { statusCode: 404, message: 'Camp registration record not found' });
  }

  const camp = registration.campId;
  const finalUnits = Number(unitsDonated) > 0 ? Number(unitsDonated) : (registration.unitsDonated || 1);

  registration.status = status;

  if (status === 'DONATED') {
    if (!registration.donationNumber) {
      registration.donationNumber = `DON-${Math.floor(100000 + Math.random() * 900000)}`;
    }
    registration.unitsDonated = finalUnits;
    registration.completedAt = new Date();
    await registration.save();

    // Increment camp collected units
    if (camp) {
      camp.totalUnitsCollected = (camp.totalUnitsCollected || 0) + finalUnits;
      await camp.save();
    }

    // ATOMICALLY INCREMENT INVENTORY STOCK for camp organization
    const targetOrgId = camp ? camp.organizationId : registration.organizationId;
    let inv = null;
    if (targetOrgId) {
      inv = await BloodInventory.findOneAndUpdate(
        { organizationId: targetOrgId, bloodGroup: registration.bloodGroup },
        { $inc: { availableUnits: finalUnits } },
        { new: true, upsert: true }
      );
    }

    // Update donor eligibility if donor user attached (56-day cooldown)
    if (registration.userId) {
      const now = new Date();
      const nextEligible = new Date(now.getTime() + 56 * 24 * 60 * 60 * 1000);
      await User.findByIdAndUpdate(registration.userId, {
        lastDonationDate: now,
        nextEligibleDonationDate: nextEligible,
        nextEligibleDate: nextEligible,
        isEligible: false,
      }).catch((err) => logger.warn(`Camp donor eligibility update failed: ${err.message}`));
    }

    // Audit logs
    await AuditLog.create({
      performedBy: user._id,
      userRole: user.role,
      action: 'DONATION_COMPLETED',
      entityType: 'CampRegistration',
      entityId: registration._id.toString(),
      newState: { status: 'DONATED', donationNumber: registration.donationNumber, unitsDonated: finalUnits },
      reason: `Physical donation completed at camp '${camp ? camp.title : 'Drive'}'`,
    });

    if (inv) {
      await AuditLog.create({
        performedBy: user._id,
        userRole: user.role,
        action: 'INVENTORY_UPDATED',
        entityType: 'BloodInventory',
        entityId: inv._id.toString(),
        newState: { bloodGroup: registration.bloodGroup, availableUnits: inv.availableUnits },
        reason: `Stock increased by ${finalUnits} units from camp donation '${registration.donationNumber}'`,
      });
    }

    return sendSuccess(res, {
      statusCode: 200,
      message: `Donation completed successfully! Assigned donation number ${registration.donationNumber}`,
      data: { registration, inventory: inv },
    });
  }

  if (status === 'REJECTED') {
    registration.rejectionReason = rejectionReason || 'Rejected during pre-donation screening';
  }

  await registration.save();

  return sendSuccess(res, {
    statusCode: 200,
    message: `Registration status updated to ${status}`,
    data: { registration },
  });
});

module.exports = {
  createCamp,
  getCamps,
  registerForCamp,
  getCampRegistrations,
  submitCampResults,
  updateCampStatus,
  checkInCampRegistration,
  updateCampRegistrationStatus,
};
