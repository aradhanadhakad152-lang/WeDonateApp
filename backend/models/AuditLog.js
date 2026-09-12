'use strict';

const mongoose = require('mongoose');

const AUDIT_ACTIONS = [
  'ORGANIZATION_REGISTERED',
  'ADMIN_APPROVED_ORGANIZATION',
  'ADMIN_REJECTED_ORGANIZATION',
  'ADMIN_SUSPENDED_ORGANIZATION',
  'HOSPITAL_VERIFIED_REQUEST',
  'HOSPITAL_REJECTED_REQUEST',
  'ADMIN_VERIFIED_REQUEST',
  'ADMIN_REJECTED_REQUEST',
  'DONOR_MATCH_NOTIFIED',
  'DONOR_CONFIRMED_MATCH',
  'INVENTORY_UPDATED',
  'CAMP_CREATED',
  'CAMP_UPDATED',
  'CAMP_COMPLETED_RESULTS_SUBMITTED',
  'USER_STATUS_CHANGED',
  'USER_AVAILABILITY_CHANGED',
];

/**
 * AuditLog Model — Security & Regulatory Compliance Trail
 */
const auditLogSchema = new mongoose.Schema(
  {
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    userRole: {
      type: String,
      required: true,
    },
    action: {
      type: String,
      required: true,
      enum: AUDIT_ACTIONS,
      index: true,
    },
    entityType: {
      type: String,
      required: true,
      enum: ['BloodRequest', 'Organization', 'BloodInventory', 'DonationCamp', 'User', 'DonorMatch'],
      index: true,
    },
    entityId: {
      type: String,
      required: true,
      index: true,
    },
    previousState: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    newState: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    reason: {
      type: String,
      trim: true,
      default: null,
    },
    ipAddress: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

auditLogSchema.index({ createdAt: -1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

module.exports = AuditLog;
