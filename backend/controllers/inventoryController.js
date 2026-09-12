'use strict';

const BloodInventory = require('../models/BloodInventory');
const AuditLog = require('../models/AuditLog');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/v1/inventory/:organizationId — Get Organization Blood Stock
const getOrganizationInventory = asyncHandler(async (req, res) => {
  const { organizationId } = req.params;

  const inventory = await BloodInventory.find({ organizationId });

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Blood inventory stock levels retrieved',
    data: { inventory },
  });
});

// PUT /api/v1/inventory/:organizationId — Update Blood Stock Levels (Audited)
const updateOrganizationInventory = asyncHandler(async (req, res) => {
  const { organizationId } = req.params;
  const { bloodGroup, availableUnits, reservedUnits, lowStockThreshold } = req.body;
  const user = req.user;

  if (!bloodGroup) {
    return sendError(res, {
      statusCode: 400,
      message: 'Blood group is required',
    });
  }

  let item = await BloodInventory.findOne({ organizationId, bloodGroup });
  const previousUnits = item ? item.availableUnits : 0;

  if (!item) {
    item = new BloodInventory({
      organizationId,
      bloodGroup,
      availableUnits: availableUnits || 0,
      reservedUnits: reservedUnits || 0,
      lowStockThreshold: lowStockThreshold || 5,
      lastUpdatedBy: user._id,
    });
  } else {
    if (availableUnits !== undefined) item.availableUnits = Math.max(0, parseInt(availableUnits, 10));
    if (reservedUnits !== undefined) item.reservedUnits = Math.max(0, parseInt(reservedUnits, 10));
    if (lowStockThreshold !== undefined) item.lowStockThreshold = Math.max(0, parseInt(lowStockThreshold, 10));
    item.lastUpdatedBy = user._id;
  }

  await item.save();

  // Audit Log
  await AuditLog.create({
    performedBy: user._id,
    userRole: user.role,
    action: 'INVENTORY_UPDATED',
    entityType: 'BloodInventory',
    entityId: item._id.toString(),
    previousState: { bloodGroup, availableUnits: previousUnits },
    newState: { bloodGroup, availableUnits: item.availableUnits, reservedUnits: item.reservedUnits },
    reason: `Stock level updated for ${bloodGroup}`,
  });

  return sendSuccess(res, {
    statusCode: 200,
    message: `Blood inventory updated for ${bloodGroup}`,
    data: { inventoryItem: item },
  });
});

// GET /api/v1/inventory — Get All Inventories Across All Organizations (Admin)
const getAllInventories = asyncHandler(async (req, res) => {
  const inventory = await BloodInventory.find()
    .populate('organizationId', 'name type address contactPhone officialEmail status')
    .sort({ updatedAt: -1 });

  return sendSuccess(res, {
    statusCode: 200,
    message: 'All inventory stock levels retrieved',
    data: { inventory },
  });
});

module.exports = {
  getOrganizationInventory,
  updateOrganizationInventory,
  getAllInventories,
};
