'use strict';

const mongoose = require('mongoose');

/**
 * FinancialDonation Model — Production Grade
 */
const financialDonationSchema = new mongoose.Schema(
  {
    receiptNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FundingCampaign',
      required: [true, 'Campaign ID is required'],
      index: true,
    },
    donorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Donor user ID is required'],
      index: true,
    },
    donorName: {
      type: String,
      trim: true,
      default: 'Anonymous Supporter',
    },
    amount: {
      type: Number,
      required: [true, 'Donation amount is required'],
      min: [1, 'Donation amount must be greater than 0'],
      max: [500000, 'Maximum single donation limit is ₹5,00,000'],
    },
    paymentStatus: {
      type: String,
      enum: ['RECORDED', 'PENDING_INTEGRATION', 'SETTLED', 'CANCELLED'],
      default: 'RECORDED',
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [300, 'Note cannot exceed 300 characters'],
      default: '',
    },
    idempotencyKey: {
      type: String,
      sparse: true,
      unique: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

financialDonationSchema.index({ donorId: 1, createdAt: -1 });

const FinancialDonation = mongoose.model('FinancialDonation', financialDonationSchema);

module.exports = FinancialDonation;
