'use strict';

const mongoose = require('mongoose');

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const DONATION_STATUSES = ['PENDING_APPROVAL', 'APPROVED', 'COMPLETED', 'REJECTED'];
const ORG_TYPES = ['HOSPITAL', 'BLOOD_BANK'];

/**
 * DonationRegistration Model — Citizen Blood Donation Registrations & Workflow Lifecycle
 */
const donationRegistrationSchema = new mongoose.Schema(
  {
    donorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    donorName: {
      type: String,
      trim: true,
      required: true,
    },
    donorPhone: {
      type: String,
      trim: true,
      default: '',
    },
    bloodGroup: {
      type: String,
      enum: {
        values: BLOOD_GROUPS,
        message: `Blood group must be one of: ${BLOOD_GROUPS.join(', ')}`,
      },
      required: true,
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    organizationType: {
      type: String,
      enum: ORG_TYPES,
      required: true,
    },
    campId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DonationCamp',
      default: null,
      index: true,
    },
    registrationDate: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: DONATION_STATUSES,
      default: 'PENDING_APPROVAL',
      index: true,
    },
    unitsDonated: {
      type: Number,
      default: 1,
      min: 1,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    completedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    rejectedAt: {
      type: Date,
      default: null,
    },
    rejectionReason: {
      type: String,
      trim: true,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

// Performance Indexes
donationRegistrationSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
donationRegistrationSchema.index({ donorId: 1, createdAt: -1 });
donationRegistrationSchema.index({ campId: 1, status: 1 });

const DonationRegistration = mongoose.model('DonationRegistration', donationRegistrationSchema);

module.exports = DonationRegistration;
