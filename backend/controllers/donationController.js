'use strict';

const DonationRegistration = require('../models/DonationRegistration');
const BloodInventory = require('../models/BloodInventory');
const Organization = require('../models/Organization');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');

/**
 * Register a new blood donation intent (PENDING_APPROVAL)
 */
exports.registerDonation = async (req, res) => {
  try {
    const { donorName, bloodGroup, organizationId, campId, unitsDonated } = req.body;

    let targetOrgId = organizationId;

    if (!targetOrgId && req.user && req.user.role === 'ORGANIZATION') {
      const org = await Organization.findOne({ officialEmail: req.user.email });
      if (org) targetOrgId = org._id;
    }

    if (!targetOrgId) {
      return res.status(400).json({
        success: false,
        message: 'Organization ID is required',
        timestamp: new Date().toISOString()
      });
    }

    const name = donorName || (req.user ? (req.user.fullName || req.user.name) : 'Anonymous Donor');
    const group = bloodGroup || (req.user ? req.user.bloodGroup : null);

    if (!name || !group) {
      return res.status(400).json({
        success: false,
        message: 'Donor name and blood group are required',
        timestamp: new Date().toISOString()
      });
    }

    const donation = await DonationRegistration.create({
      donorId: req.user ? req.user._id : null,
      donorName: name,
      bloodGroup: group,
      organizationId: targetOrgId,
      campId: campId || null,
      unitsDonated: unitsDonated || 1,
      status: 'PENDING_APPROVAL'
    });

    if (req.user) {
      await AuditLog.create({
        performedBy: req.user._id,
        userRole: req.user.role,
        action: 'DONATION_REGISTERED',
        entityType: 'DonationRegistration',
        entityId: donation._id.toString(),
        newState: { status: 'PENDING_APPROVAL', bloodGroup: group },
        reason: 'New blood donation registration submitted'
      }).catch(err => console.error('AuditLog error:', err));
    }

    return res.status(201).json({
      success: true,
      message: 'Blood donation registered successfully and is pending approval',
      data: { donation },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error registering donation:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while registering donation',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Get donation registrations for current organization or admin
 */
exports.getOrganizationDonationRegistrations = async (req, res) => {
  try {
    let filter = {};

    if (['HOSPITAL_MANAGER', 'BLOOD_BANK_MANAGER', 'HOSPITAL_STAFF'].includes(req.user.role) || (req.user.role === 'ORGANIZATION' && req.user.organizationId)) {
      if (req.user.organizationId) {
        filter.organizationId = req.user.organizationId;
      } else {
        const org = await Organization.findOne({ officialEmail: req.user.email });
        if (org) filter.organizationId = org._id;
      }
    } else if (req.user.organizationId) {
      filter.organizationId = req.user.organizationId;
    } else if (req.query.organizationId) {
      filter.organizationId = req.query.organizationId;
    }

    if (req.query.status) {
      filter.status = req.query.status;
    }

    const donations = await DonationRegistration.find(filter)
      .populate('donorId', 'fullName name phone bloodGroup')
      .populate('campId', 'title location')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      message: 'Donation registrations retrieved successfully',
      data: { donations },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching organization donations:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error fetching donation registrations',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Approve donation registration
 */
exports.approveDonationRegistration = async (req, res) => {
  try {
    const { id } = req.params;
    const donation = await DonationRegistration.findById(id);

    if (!donation) {
      return res.status(404).json({
        success: false,
        message: 'Donation registration not found',
        timestamp: new Date().toISOString()
      });
    }

    if (donation.status !== 'PENDING_APPROVAL') {
      return res.status(400).json({
        success: false,
        message: `Cannot approve donation with status ${donation.status}`,
        timestamp: new Date().toISOString()
      });
    }

    donation.status = 'APPROVED';
    donation.approvedAt = new Date();
    await donation.save();

    await AuditLog.create({
      performedBy: req.user._id,
      userRole: req.user.role,
      action: 'DONATION_APPROVED',
      entityType: 'DonationRegistration',
      entityId: donation._id.toString(),
      newState: { status: 'APPROVED' },
      reason: 'Donation registration approved'
    }).catch(err => console.error('AuditLog error:', err));

    return res.status(200).json({
      success: true,
      message: 'Donation registration approved successfully',
      data: { donation },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error approving donation:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while approving donation',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Complete physical blood donation — ATOMICALLY INCREMENTS INVENTORY STOCK
 */
exports.completeDonationRegistration = async (req, res) => {
  try {
    const { id } = req.params;
    const { unitsDonated } = req.body;

    const donation = await DonationRegistration.findById(id);

    if (!donation) {
      return res.status(404).json({
        success: false,
        message: 'Donation registration not found',
        timestamp: new Date().toISOString()
      });
    }

    if (['COMPLETED', 'REJECTED'].includes(donation.status)) {
      return res.status(400).json({
        success: false,
        message: `Donation is already ${donation.status}`,
        timestamp: new Date().toISOString()
      });
    }

    const finalUnits = unitsDonated && Number(unitsDonated) > 0 ? Number(unitsDonated) : (donation.unitsDonated || 1);

    donation.status = 'COMPLETED';
    donation.unitsDonated = finalUnits;
    donation.completedAt = new Date();
    await donation.save();

    // ATOMICALLY INCREMENT INVENTORY STOCK
    const inv = await BloodInventory.findOneAndUpdate(
      { organizationId: donation.organizationId, bloodGroup: donation.bloodGroup },
      { $inc: { availableUnits: finalUnits } },
      { new: true, upsert: true }
    );

    // Update donor eligibility if donor user is attached
    if (donation.donorId) {
      const now = new Date();
      const nextEligible = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
      await User.findByIdAndUpdate(donation.donorId, {
        lastDonationDate: now,
        nextEligibleDate: nextEligible,
        isEligible: false
      }).catch(err => console.error('Failed to update donor eligibility:', err));
    }

    // Audit logs
    await AuditLog.create({
      performedBy: req.user._id,
      userRole: req.user.role,
      action: 'DONATION_COMPLETED',
      entityType: 'DonationRegistration',
      entityId: donation._id.toString(),
      newState: { status: 'COMPLETED', unitsDonated: finalUnits },
      reason: 'Physical donation completed successfully'
    }).catch(err => console.error('AuditLog error:', err));

    await AuditLog.create({
      performedBy: req.user._id,
      userRole: req.user.role,
      action: 'INVENTORY_UPDATED',
      entityType: 'BloodInventory',
      entityId: inv._id.toString(),
      newState: { bloodGroup: donation.bloodGroup, availableUnits: inv.availableUnits },
      reason: `Stock increased by ${finalUnits} units from completed donation`
    }).catch(err => console.error('AuditLog error:', err));

    return res.status(200).json({
      success: true,
      message: 'Donation completed successfully and inventory stock updated',
      data: { donation, inventory: inv },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error completing donation:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while completing donation',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Reject donation registration
 */
exports.rejectDonationRegistration = async (req, res) => {
  try {
    const { id } = req.params;
    const { rejectionReason } = req.body;

    const donation = await DonationRegistration.findById(id);

    if (!donation) {
      return res.status(404).json({
        success: false,
        message: 'Donation registration not found',
        timestamp: new Date().toISOString()
      });
    }

    if (donation.status === 'COMPLETED') {
      return res.status(400).json({
        success: false,
        message: 'Cannot reject an already completed donation',
        timestamp: new Date().toISOString()
      });
    }

    donation.status = 'REJECTED';
    donation.rejectionReason = rejectionReason || 'Rejected during organization verification';
    donation.rejectedAt = new Date();
    await donation.save();

    await AuditLog.create({
      performedBy: req.user._id,
      userRole: req.user.role,
      action: 'DONATION_REJECTED',
      entityType: 'DonationRegistration',
      entityId: donation._id.toString(),
      newState: { status: 'REJECTED', rejectionReason: donation.rejectionReason },
      reason: donation.rejectionReason
    }).catch(err => console.error('AuditLog error:', err));

    return res.status(200).json({
      success: true,
      message: 'Donation registration rejected',
      data: { donation },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error rejecting donation:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while rejecting donation',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Get logged-in user's own donations
 */
exports.getMyDonations = async (req, res) => {
  try {
    const donations = await DonationRegistration.find({ donorId: req.user._id })
      .populate('organizationId', 'name type address contactPhone')
      .populate('campId', 'title date location')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      message: 'User donation history retrieved',
      data: { donations },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching user donations:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching user donations',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};
