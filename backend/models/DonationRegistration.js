'use strict';

const mongoose = require('mongoose');

const donationRegistrationSchema = new mongoose.Schema(
  {
    donorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
      index: true
    },
    donorName: {
      type: String,
      required: true,
      trim: true
    },
    bloodGroup: {
      type: String,
      required: true,
      enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
      uppercase: true,
      trim: true
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true
    },
    campId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DonationCamp',
      required: false,
      index: true
    },
    status: {
      type: String,
      enum: ['PENDING_APPROVAL', 'APPROVED', 'COMPLETED', 'REJECTED'],
      default: 'PENDING_APPROVAL',
      index: true
    },
    unitsDonated: {
      type: Number,
      default: 1,
      min: 1
    },
    rejectionReason: {
      type: String,
      trim: true
    },
    approvedAt: {
      type: Date
    },
    completedAt: {
      type: Date
    },
    rejectedAt: {
      type: Date
    }
  },
  {
    timestamps: true
  }
);

donationRegistrationSchema.index({ organizationId: 1, status: 1 });

module.exports = mongoose.model('DonationRegistration', donationRegistrationSchema);
