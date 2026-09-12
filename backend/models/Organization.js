'use strict';

const mongoose = require('mongoose');

const ORGANIZATION_TYPES = ['HOSPITAL', 'BLOOD_BANK'];
const ORGANIZATION_STATUSES = ['PENDING_VERIFICATION', 'APPROVED', 'REJECTED', 'SUSPENDED'];

/**
 * Organization Model — Production Grade
 *
 * Represents registered Hospitals and Blood Banks in the WE DONATE network.
 * Only APPROVED organizations are permitted to manage verification queues and inventory.
 */
const organizationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Organization name is required'],
      trim: true,
      maxlength: [200, 'Organization name cannot exceed 200 characters'],
    },
    type: {
      type: String,
      required: [true, 'Organization type is required'],
      enum: {
        values: ORGANIZATION_TYPES,
        message: `Type must be one of: ${ORGANIZATION_TYPES.join(', ')}`,
      },
      index: true,
    },
    registrationLicense: {
      type: String,
      trim: true,
      sparse: true,
    },
    address: {
      street: { type: String, trim: true, default: '' },
      city: { type: String, required: true, trim: true },
      state: { type: String, required: true, trim: true },
      pincode: { type: String, trim: true, default: '' },
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
        required: [true, 'Location coordinates are required'],
        default: [77.2090, 28.6139], // Default Delhi center if unspecified
      },
    },
    contactPhone: {
      type: String,
      required: [true, 'Contact phone is required'],
      trim: true,
    },
    officialEmail: {
      type: String,
      required: [true, 'Official email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email format'],
      index: true,
    },
    authorizedPerson: {
      name: { type: String, required: true, trim: true },
      designation: { type: String, trim: true, default: 'Manager' },
      phone: { type: String, required: true, trim: true },
      email: { type: String, trim: true, lowercase: true },
    },
    documents: [
      {
        docType: { type: String, trim: true },
        url: { type: String, trim: true },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    status: {
      type: String,
      enum: {
        values: ORGANIZATION_STATUSES,
        message: `Status must be one of: ${ORGANIZATION_STATUSES.join(', ')}`,
      },
      default: 'PENDING_VERIFICATION',
      index: true,
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    rejectionReason: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

organizationSchema.index({ location: '2dsphere' });
organizationSchema.index({ type: 1, status: 1, city: 1 });

const Organization = mongoose.model('Organization', organizationSchema);

module.exports = Organization;
