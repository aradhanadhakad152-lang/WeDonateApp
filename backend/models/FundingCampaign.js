'use strict';

const mongoose = require('mongoose');

/**
 * FundingCampaign Model — Production Grade
 */
const fundingCampaignSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Campaign title is required'],
      trim: true,
      maxlength: [150, 'Title cannot exceed 150 characters'],
    },
    description: {
      type: String,
      required: [true, 'Campaign description is required'],
      trim: true,
    },
    patientName: {
      type: String,
      trim: true,
      default: null,
    },
    hospitalName: {
      type: String,
      trim: true,
      default: null,
    },
    targetAmount: {
      type: Number,
      required: [true, 'Target amount is required'],
      min: [100, 'Target amount must be at least ₹100'],
      default: 50000,
    },
    raisedAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    category: {
      type: String,
      enum: ['PATIENT_CARE', 'BLOOD_BANK_DRIVE', 'EQUIPMENT', 'EMERGENCY_ICU', 'OTHER'],
      default: 'PATIENT_CARE',
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'COMPLETED', 'CANCELLED'],
      default: 'ACTIVE',
    },
    donorCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual: remainingAmount
fundingCampaignSchema.virtual('remainingAmount').get(function () {
  const target = typeof this.targetAmount === 'number' ? this.targetAmount : 0;
  const raised = typeof this.raisedAmount === 'number' ? this.raisedAmount : 0;
  return target > raised ? target - raised : 0;
});

// Virtual: progressPercentage
fundingCampaignSchema.virtual('progressPercentage').get(function () {
  const target = typeof this.targetAmount === 'number' ? this.targetAmount : 0;
  const raised = typeof this.raisedAmount === 'number' ? this.raisedAmount : 0;
  if (target <= 0) return 0;
  return Math.min(100, Math.round((raised / target) * 100));
});

const FundingCampaign = mongoose.model('FundingCampaign', fundingCampaignSchema);

module.exports = FundingCampaign;
