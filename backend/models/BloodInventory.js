'use strict';

const mongoose = require('mongoose');

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

/**
 * BloodInventory Model — Real-Time Stock Tracker
 */
const bloodInventorySchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    bloodGroup: {
      type: String,
      required: true,
      enum: BLOOD_GROUPS,
    },
    availableUnits: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    reservedUnits: {
      type: Number,
      default: 0,
      min: 0,
    },
    lowStockThreshold: {
      type: Number,
      default: 5,
    },
    lastUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

bloodInventorySchema.index({ organizationId: 1, bloodGroup: 1 }, { unique: true });

const BloodInventory = mongoose.model('BloodInventory', bloodInventorySchema);

module.exports = BloodInventory;
