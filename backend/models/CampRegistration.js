'use strict';

const mongoose = require('mongoose');

const REGISTRATION_STATUSES = [
  'REGISTERED',
  'CHECKED_IN',
  'ATTENDED',
  'APPROVED',
  'DONATED',
  'DID_NOT_DONATE',
  'REJECTED',
  'CANCELLED',
];

/**
 * CampRegistration Model — User Registrations for Donation Drives
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
    },
    attendedAt: {
      type: Date,
      default: null,
    },
    checkInAt: {
      type: Date,
      default: null,
    },
    donationNumber: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    unitsDonated: {
      type: Number,
      default: 1,
      min: 1,
    },
    rejectionReason: {
      type: String,
      trim: true,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

campRegistrationSchema.index({ campId: 1, userId: 1 }, { unique: true });

const CampRegistration = mongoose.model('CampRegistration', campRegistrationSchema);

module.exports = CampRegistration;
