'use strict';

const mongoose = require('mongoose');

const REGISTRATION_STATUSES = ['REGISTERED', 'ATTENDED', 'DONATED', 'CANCELLED'];

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
  },
  {
    timestamps: true,
  }
);

campRegistrationSchema.index({ campId: 1, userId: 1 }, { unique: true });

const CampRegistration = mongoose.model('CampRegistration', campRegistrationSchema);

module.exports = CampRegistration;
