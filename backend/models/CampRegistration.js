'use strict';

const mongoose = require('mongoose');

const REGISTRATION_STATUSES = ['REGISTERED', 'ATTENDED', 'DONATED', 'DEFERRED', 'CANCELLED'];

/**
 * CampRegistration Model — Citizen Registrations for Donation Drives
 */
const campRegistrationSchema = new mongoose.Schema(
  {
    campId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DonationCamp',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    bloodGroup: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: REGISTRATION_STATUSES,
      default: 'REGISTERED',
      index: true,
    },
    donatedUnits: {
      type: Number,
      default: 0,
    },
    notes: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate user registration per camp
campRegistrationSchema.index({ campId: 1, userId: 1 }, { unique: true });

const CampRegistration = mongoose.model('CampRegistration', campRegistrationSchema);

module.exports = CampRegistration;
