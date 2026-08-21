'use strict';

const mongoose = require('mongoose');

const HOSPITAL_STATUSES = ['PENDING_VERIFICATION', 'VERIFIED', 'SUSPENDED'];

/**
 * Hospital Model
 *
 * Represents a hospital registered in the WE DONATE system.
 * Hospital staff accounts are linked to a Hospital document via ref.
 */
const hospitalSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Hospital name is required'],
      trim: true,
      maxlength: [200, 'Hospital name cannot exceed 200 characters'],
    },
    registrationNumber: {
      type: String,
      trim: true,
      sparse: true,
      unique: true,
    },
    address: {
      street: { type: String, trim: true },
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      pincode: { type: String, trim: true },
      country: { type: String, trim: true, default: 'India' },
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: undefined,
      },
    },
    contactPhone: {
      type: String,
      required: [true, 'Hospital contact phone is required'],
      trim: true,
      match: [/^\+[1-9]\d{7,14}$/, 'Phone must be in E.164 format'],
    },
    contactEmail: {
      type: String,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email format'],
    },
    bloodBankAvailable: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: {
        values: HOSPITAL_STATUSES,
        message: `Status must be one of: ${HOSPITAL_STATUSES.join(', ')}`,
      },
      default: 'PENDING_VERIFICATION',
    },
    // Admin who verified this hospital
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    // Staff members linked to this hospital
    staffMembers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
  },
  {
    timestamps: true,
  }
);

// 2dsphere index for finding nearby hospitals
hospitalSchema.index({ location: '2dsphere' });
hospitalSchema.index({ status: 1, name: 1 });

const Hospital = mongoose.model('Hospital', hospitalSchema);

module.exports = Hospital;
