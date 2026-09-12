'use strict';

const mongoose = require('mongoose');

const CAMP_STATUSES = ['PENDING_APPROVAL', 'PUBLISHED', 'ONGOING', 'COMPLETED', 'CANCELLED'];

/**
 * DonationCamp Model — Community & Hospital Blood Donation Drives
 */
const donationCampSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Camp title is required'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    date: {
      type: Date,
      required: [true, 'Camp date is required'],
    },
    startTime: {
      type: String,
      required: true,
    },
    endTime: {
      type: String,
      required: true,
    },
    address: {
      type: String,
      required: true,
    },
    city: {
      type: String,
      required: true,
      index: true,
    },
    state: {
      type: String,
      required: true,
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
      },
    },
    contactPhone: {
      type: String,
      required: true,
    },
    contactEmail: {
      type: String,
    },
    supportedBloodGroups: [
      {
        type: String,
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
      enum: CAMP_STATUSES,
      default: 'PENDING_APPROVAL',
      index: true,
    },
    donationResults: {
      type: mongoose.Schema.Types.Mixed, // e.g. { "A+": 10, "B+": 15 }
      default: null,
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

const DonationCamp = mongoose.model('DonationCamp', donationCampSchema);

module.exports = DonationCamp;
