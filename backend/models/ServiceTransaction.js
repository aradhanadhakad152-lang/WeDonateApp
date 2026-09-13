'use strict';

const mongoose = require('mongoose');

const TRANSACTION_STATUSES = ['PENDING', 'PAID', 'FAILED', 'REFUNDED'];
const PAYMENT_GATEWAYS = ['RAZORPAY', 'STRIPE', 'OTHER'];

/**
 * ServiceTransaction Model — WE DONATE Platform Service Fee (₹99)
 * Technology & Donation Coordination Service Fee
 */
const serviceTransactionSchema = new mongoose.Schema(
  {
    requestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BloodRequest',
      required: [true, 'Blood request ID is required'],
      unique: true,
      index: true,
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: [true, 'Organization ID is required'],
      index: true,
    },
    amount: {
      type: Number,
      default: 99,
      immutable: true,
    },
    currency: {
      type: String,
      default: 'INR',
    },
    status: {
      type: String,
      enum: {
        values: TRANSACTION_STATUSES,
        message: `Status must be one of: ${TRANSACTION_STATUSES.join(', ')}`,
      },
      default: 'PENDING',
      index: true,
    },
    description: {
      type: String,
      default: 'WE DONATE Platform Service Fee — Technology & Donation Coordination',
    },
    paymentGateway: {
      type: String,
      enum: PAYMENT_GATEWAYS,
      default: 'RAZORPAY',
    },
    transactionId: {
      type: String,
      trim: true,
      sparse: true,
      index: true,
    },
    razorpayOrderId: {
      type: String,
      trim: true,
      sparse: true,
      index: true,
    },
    razorpayPaymentId: {
      type: String,
      trim: true,
      sparse: true,
    },
    razorpaySignature: {
      type: String,
      trim: true,
    },
    invoiceNumber: {
      type: String,
      trim: true,
      sparse: true,
      unique: true,
    },
    paidAt: {
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

// Indexes for revenue querying and analytics
serviceTransactionSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
serviceTransactionSchema.index({ createdAt: -1, status: 1 });

const ServiceTransaction = mongoose.model('ServiceTransaction', serviceTransactionSchema);

module.exports = ServiceTransaction;
