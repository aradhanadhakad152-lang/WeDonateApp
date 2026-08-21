'use strict';

const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../utils/logger');

/**
 * Notification Controller — Production Grade Device Token & Notification Management
 *
 * SECURITY:
 * - User identity is strictly derived from JWT (req.user._id).
 * - Prevents IDOR: Users can only query, read, or modify their own notifications.
 */

// POST /api/v1/notifications/device-token — Register or update FCM device token
const registerDeviceToken = asyncHandler(async (req, res) => {
  const user = req.user;
  const { token } = req.body;

  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    return sendError(res, {
      statusCode: 422,
      message: 'A valid FCM device token string is required',
    });
  }

  const cleanToken = token.trim();

  user.deviceToken = cleanToken;
  if (!user.deviceTokens.includes(cleanToken)) {
    user.deviceTokens.push(cleanToken);
  }

  await user.save();

  logger.info(`FCM device token registered for user: ${user._id}`);

  return sendSuccess(res, {
    statusCode: 200,
    message: 'FCM device token registered successfully',
    data: {
      registeredTokenCount: user.deviceTokens.length,
    },
  });
});

// DELETE /api/v1/notifications/device-token — Remove FCM device token on logout
const removeDeviceToken = asyncHandler(async (req, res) => {
  const user = req.user;
  const tokenToRemove = req.body.token || req.query.token;

  if (tokenToRemove) {
    user.deviceTokens = user.deviceTokens.filter((t) => t !== tokenToRemove);
    if (user.deviceToken === tokenToRemove) {
      user.deviceToken = user.deviceTokens[0] || null;
    }
    await user.save();
  }

  logger.info(`FCM device token removed for user: ${user._id}`);

  return sendSuccess(res, {
    statusCode: 200,
    message: 'FCM device token removed successfully',
  });
});

// GET /api/v1/notifications — Get authenticated user's notification history
const getUserNotifications = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const notifications = await Notification.find({ user: userId })
    .populate('bloodRequest', 'patientName bloodGroup hospitalName status')
    .sort({ createdAt: -1 })
    .limit(50)
    .exec();

  return sendSuccess(res, {
    statusCode: 200,
    message: `Retrieved ${notifications.length} notification(s)`,
    data: {
      notifications,
      total: notifications.length,
    },
  });
});

// POST /api/v1/notifications/:id/read — Mark a notification as read
const markAsRead = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return sendError(res, {
      statusCode: 400,
      message: 'Invalid notification ID format',
    });
  }

  const notification = await Notification.findOne({ _id: id, user: userId });

  if (!notification) {
    return sendError(res, {
      statusCode: 404,
      message: 'Notification not found or unauthorized',
    });
  }

  notification.isRead = true;
  notification.readAt = new Date();
  notification.status = 'OPENED';
  await notification.save();

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Notification marked as read',
    data: {
      notification,
    },
  });
});

// GET /api/v1/notifications/unread-count — Get unread count
const getUnreadCount = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const count = await Notification.countDocuments({ user: userId, isRead: false });

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Unread count retrieved successfully',
    data: {
      unreadCount: count,
    },
  });
});

module.exports = {
  registerDeviceToken,
  removeDeviceToken,
  getUserNotifications,
  markAsRead,
  getUnreadCount,
};
