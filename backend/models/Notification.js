'use strict';

const mongoose = require('mongoose');

const NOTIFICATION_TYPES = [
  'BLOOD_REQUEST',
  'MATCH_CREATED',
  'DONOR_ACCEPTED',
  'DONOR_REJECTED',
  'REQUEST_CANCELLED',
  'REQUEST_FULFILLED',
  'MATCH_EXPIRED',
];

const NOTIFICATION_STATUSES = ['PENDING', 'SENT', 'FAILED', 'OPENED', 'EXPIRED'];

/**
 * Notification Model — Production Grade
 *
 * Tracks push notification delivery and read states for emergency blood alerts.
 */
const notificationSchema = new mongoose.Schema(
  {
    // Target User (Recipient)
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Notification recipient user ID is required'],
      index: true,
    },

    // Associated Entities
    bloodRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BloodRequest',
      index: true,
      default: null,
    },
    donorMatch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DonorMatch',
      index: true,
      default: null,
    },

    // Notification Content
    type: {
      type: String,
      required: [true, 'Notification type is required'],
      enum: {
        values: NOTIFICATION_TYPES,
        message: `Notification type must be one of: ${NOTIFICATION_TYPES.join(', ')}`,
      },
    },
    title: {
      type: String,
      required: [true, 'Notification title is required'],
      trim: true,
      maxlength: [150, 'Title cannot exceed 150 characters'],
    },
    body: {
      type: String,
      required: [true, 'Notification body is required'],
      trim: true,
      maxlength: [500, 'Body cannot exceed 500 characters'],
    },
    channel: {
      type: String,
      default: 'we_donate_emergency',
    },

    // Status & Read State
    status: {
      type: String,
      enum: {
        values: NOTIFICATION_STATUSES,
        message: `Notification status must be one of: ${NOTIFICATION_STATUSES.join(', ')}`,
      },
      default: 'PENDING',
      index: true,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
      default: null,
    },
    sentAt: {
      type: Date,
      default: null,
    },
    providerMessageId: {
      type: String,
      default: null,
    },
    error: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for fast querying of unread notifications
notificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ user: 1, status: 1, createdAt: -1 });

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
