'use strict';

const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const {
  registerDeviceToken,
  removeDeviceToken,
  getUserNotifications,
  markAsRead,
  getUnreadCount,
} = require('../controllers/notificationController');

/**
 * Notification Routes
 * Base path: /api/v1/notifications
 */

// POST /api/v1/notifications/device-token — Register FCM device token
router.post('/device-token', authenticate, registerDeviceToken);

// DELETE /api/v1/notifications/device-token — Remove FCM device token
router.delete('/device-token', authenticate, removeDeviceToken);

// GET /api/v1/notifications — Get authenticated user's notifications
router.get('/', authenticate, getUserNotifications);

// GET /api/v1/notifications/unread-count — Get unread count
router.get('/unread-count', authenticate, getUnreadCount);

// POST /api/v1/notifications/:id/read — Mark notification as read
router.post('/:id/read', authenticate, markAsRead);

module.exports = router;
