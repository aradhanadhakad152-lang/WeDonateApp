'use strict';

const mongoose = require('mongoose');

const MATCH_STATUSES = ['PENDING', 'NOTIFIED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED', 'COMPLETED'];

/**
 * DonorMatch Model — Production Grade
 *
 * Represents an individual match record linking a BloodRequest with a nearby compatible Donor.
 *
 * SECURITY & CONCURRENCY:
 * - Unique compound index on { bloodRequest: 1, donor: 1 } prevents duplicate matches.
 * - Tracks exact Haversine distance, match timestamp, response timestamp, and status.
 */
const donorMatchSchema = new mongoose.Schema(
  {
    // References
    bloodRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BloodRequest',
      required: [true, 'BloodRequest reference is required'],
      index: true,
    },
    donor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Donor User reference is required'],
      index: true,
    },
    requester: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Requester User reference is required'],
      index: true,
    },

    // Blood Details
    donorBloodGroup: {
      type: String,
      required: [true, 'Donor blood group is required'],
    },
    requestedBloodGroup: {
      type: String,
      required: [true, 'Requested blood group is required'],
    },

    // Distance & Location
    distanceKm: {
      type: Number,
      required: [true, 'Calculated distance in kilometers is required'],
    },
    donorLocation: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // GeoJSON order: [longitude, latitude]
        required: true,
      },
    },

    // Match Status Lifecycle
    status: {
      type: String,
      enum: {
        values: MATCH_STATUSES,
        message: `Match status must be one of: ${MATCH_STATUSES.join(', ')}`,
      },
      default: 'PENDING',
      index: true,
    },
    matchedAt: {
      type: Date,
      default: Date.now,
    },
    respondedAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // Default 24 hours
    },
    rejectionReason: {
      type: String,
      trim: true,
      maxlength: [300, 'Rejection reason cannot exceed 300 characters'],
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
// Unique compound index prevents duplicate match records for the same donor + blood request
donorMatchSchema.index({ bloodRequest: 1, donor: 1 }, { unique: true });
donorMatchSchema.index({ donor: 1, status: 1 });
donorMatchSchema.index({ bloodRequest: 1, status: 1, distanceKm: 1 });

const DonorMatch = mongoose.model('DonorMatch', donorMatchSchema);

module.exports = DonorMatch;
