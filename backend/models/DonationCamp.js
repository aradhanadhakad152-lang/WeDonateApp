'use strict';

const mongoose = require('mongoose');

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const CAMP_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'PUBLISHED', 'ONGOING', 'COMPLETED', 'CANCELLED'];

/**
 * DonationCamp Model — Blood Donation Drive Management
 *
 * Represents blood donation camps organized by Hospitals or Blood Banks.
 */
const donationCampSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Camp title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: [true, 'Organization ID is required'],
      index: true,
    },
    date: {
      type: Date,
      required: [true, 'Camp date is required'],
      index: true,
    },
    startTime: {
      type: String,
      required: [true, 'Start time is required'],
      trim: true, // e.g. "09:00 AM"
    },
    endTime: {
      type: String,
      required: [true, 'End time is required'],
      trim: true, // e.g. "05:00 PM"
    },
    address: {
      type: String,
      required: [true, 'Address is required'],
      trim: true,
    },
    city: {
      type: String,
      required: [true, 'City is required'],
      trim: true,
    },
    state: {
      type: String,
      required: [true, 'State is required'],
      trim: true,
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: [true, 'Location coordinates are required'],
      },
    },
    contactPhone: {
      type: String,
      required: [true, 'Contact phone is required'],
      trim: true,
    },
    contactEmail: {
      type: String,
      trim: true,
      lowercase: true,
    },
    posterUrl: {
      type: String,
      trim: true,
      default: null,
    },
    supportedBloodGroups: [
      {
        type: String,
        enum: BLOOD_GROUPS,
      },
    ],
    registrationLimit: {
      type: Number,
      default: 200,
    },
    registeredCount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: {
        values: CAMP_STATUSES,
        message: `Camp status must be one of: ${CAMP_STATUSES.join(', ')}`,
      },
      default: 'PENDING_APPROVAL',
      index: true,
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
    donationResults: {
      type: Map,
      of: Number, // e.g. { "A+": 12, "O+": 21 }
      default: {},
    },
    totalUnitsCollected: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

donationCampSchema.index({ location: '2dsphere' });
donationCampSchema.index({ status: 1, date: 1, city: 1 });

const DonationCamp = mongoose.model('DonationCamp', donationCampSchema);

module.exports = DonationCamp;
