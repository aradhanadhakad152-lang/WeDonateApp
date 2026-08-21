'use strict';

const mongoose = require('mongoose');

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const URGENCY_LEVELS = ['CRITICAL', 'URGENT', 'NORMAL'];
const REQUEST_STATUSES = ['OPEN', 'MATCHING', 'ACCEPTED', 'FULFILLED', 'CANCELLED', 'EXPIRED'];

/**
 * BloodRequest Model — Production Grade
 *
 * Represents an emergency blood donation request created by a patient or hospital staff.
 *
 * SECURITY & GEOSPATIAL RULES:
 * - requesterId is strictly derived from the authenticated JWT user.
 * - location uses GeoJSON Point [longitude, latitude] order for 2dsphere geospatial indexing.
 * - Status transitions are validated server-side.
 */
const bloodRequestSchema = new mongoose.Schema(
  {
    // Requester (Derived strictly from JWT)
    requesterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Requester ID is required'],
      index: true,
    },

    // Patient Information
    patientName: {
      type: String,
      required: [true, 'Patient name is required'],
      trim: true,
      maxlength: [100, 'Patient name cannot exceed 100 characters'],
    },

    // Blood Requirement
    bloodGroup: {
      type: String,
      required: [true, 'Blood group is required'],
      enum: {
        values: BLOOD_GROUPS,
        message: `Blood group must be one of: ${BLOOD_GROUPS.join(', ')}`,
      },
      index: true,
    },
    unitsRequired: {
      type: Number,
      required: [true, 'Units required is required'],
      min: [1, 'At least 1 unit is required'],
      max: [10, 'Cannot request more than 10 units in a single request'],
    },
    urgency: {
      type: String,
      required: [true, 'Urgency level is required'],
      enum: {
        values: URGENCY_LEVELS,
        message: `Urgency must be one of: ${URGENCY_LEVELS.join(', ')}`,
      },
      default: 'NORMAL',
      index: true,
    },
    requiredBy: {
      type: Date,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // Default: 24 hours from now
    },
    reason: {
      type: String,
      trim: true,
      maxlength: [300, 'Reason cannot exceed 300 characters'],
    },

    // Hospital & Location
    hospitalName: {
      type: String,
      required: [true, 'Hospital name is required'],
      trim: true,
      maxlength: [200, 'Hospital name cannot exceed 200 characters'],
    },
    hospitalAddress: {
      type: String,
      required: [true, 'Hospital address is required'],
      trim: true,
      maxlength: [300, 'Hospital address cannot exceed 300 characters'],
    },
    hospitalLatitude: {
      type: Number,
      required: [true, 'Hospital latitude is required'],
      min: [-90, 'Latitude must be between -90 and 90'],
      max: [90, 'Latitude must be between -90 and 90'],
    },
    hospitalLongitude: {
      type: Number,
      required: [true, 'Hospital longitude is required'],
      min: [-180, 'Longitude must be between -180 and 180'],
      max: [180, 'Longitude must be between -180 and 180'],
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // GeoJSON order: [longitude, latitude]
        required: [true, 'Location coordinates are required'],
      },
    },

    // Contact & Notes
    contactPhone: {
      type: String,
      required: [true, 'Contact phone is required'],
      trim: true,
      match: [/^\+[1-9]\d{7,14}$/, 'Contact phone must be in E.164 format (e.g. +919876543210)'],
    },
    additionalNotes: {
      type: String,
      trim: true,
      maxlength: [500, 'Additional notes cannot exceed 500 characters'],
    },

    // Lifecycle Status
    status: {
      type: String,
      enum: {
        values: REQUEST_STATUSES,
        message: `Status must be one of: ${REQUEST_STATUSES.join(', ')}`,
      },
      default: 'OPEN',
      index: true,
    },
    acceptedDonorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    fulfilledAt: {
      type: Date,
      default: null,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// =============================================
// Indexes
// =============================================
bloodRequestSchema.index({ location: '2dsphere' });
bloodRequestSchema.index({ status: 1, bloodGroup: 1, urgency: 1, createdAt: -1 });
bloodRequestSchema.index({ requesterId: 1, createdAt: -1 });

// =============================================
// Middleware
// =============================================
bloodRequestSchema.pre('validate', function (next) {
  // Sync GeoJSON coordinates with hospitalLongitude & hospitalLatitude
  if (this.hospitalLongitude !== undefined && this.hospitalLatitude !== undefined) {
    this.location = {
      type: 'Point',
      coordinates: [Number(this.hospitalLongitude), Number(this.hospitalLatitude)],
    };
  }
  next();
});

// Auto check expiration before save
bloodRequestSchema.pre('save', function (next) {
  if (
    this.requiredBy &&
    new Date() > new Date(this.requiredBy) &&
    ['OPEN', 'MATCHING'].includes(this.status)
  ) {
    this.status = 'EXPIRED';
  }
  next();
});

const BloodRequest = mongoose.model('BloodRequest', bloodRequestSchema);

module.exports = BloodRequest;
