'use strict';

const mongoose = require('mongoose');

const OTP_PURPOSES = ['LOGIN', 'REGISTER'];

/**
 * OtpVerification Model — Secure SMS OTP Verification & Expiration Tracker
 */
const otpVerificationSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
      index: true,
    },
    purpose: {
      type: String,
      enum: {
        values: OTP_PURPOSES,
        message: `Purpose must be one of: ${OTP_PURPOSES.join(', ')}`,
      },
      required: [true, 'OTP purpose is required'],
    },
    otpHash: {
      type: String,
      required: [true, 'OTP hash is required'],
      select: false,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 }, // Auto-deletes document when expiresAt is reached
    },
    attempts: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

otpVerificationSchema.index({ phone: 1, purpose: 1, createdAt: -1 });

const OtpVerification = mongoose.model('OtpVerification', otpVerificationSchema);

module.exports = OtpVerification;
