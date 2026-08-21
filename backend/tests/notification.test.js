'use strict';

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../server');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { generateTokenPair } = require('../services/jwtService');
const { sendNotificationToUser } = require('../services/notificationService');
const { sendEmergencySMS } = require('../services/smsService');

process.env.JWT_ACCESS_SECRET = 'test_access_secret_1234567890_1234567890_1234567890_1234567890';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_1234567890_1234567890_1234567890_1234567890';
process.env.NODE_ENV = 'test';

describe('Milestone 7 Push Notifications & SMS Alert Suite', () => {
  let userA;
  let userB;
  let tokenA;
  let tokenB;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0 && process.env.MONGODB_URI) {
      let uri = process.env.MONGODB_URI.trim().replace(/^MONGODB_URI=\s*/i, '').replace(/^["']|["']$/g, '');
      try {
        await mongoose.connect(uri, { serverSelectionTimeoutMS: 3000 });
      } catch (err) {
        console.warn('MongoDB connection fallback during notification test execution');
      }
    }

    if (mongoose.connection.readyState === 1) {
      await User.deleteMany({ firebaseUid: /^TEST_NOTIF_M7_/ });
      await Notification.deleteMany({ title: /^TEST_NOTIF_/ });

      // User A
      userA = new User({
        firebaseUid: 'TEST_NOTIF_M7_USER_A',
        phone: '+919555511111',
        fullName: 'Notif User A',
        bloodGroup: 'A+',
        role: 'CITIZEN',
        accountStatus: 'ACTIVE',
        isActive: true,
        deviceTokens: ['FCM_TOKEN_SAMPLE_A1'],
      });
      await userA.save();
      tokenA = generateTokenPair(userA).accessToken;

      // User B
      userB = new User({
        firebaseUid: 'TEST_NOTIF_M7_USER_B',
        phone: '+919555522222',
        fullName: 'Notif User B',
        bloodGroup: 'O+',
        role: 'CITIZEN',
        accountStatus: 'ACTIVE',
        isActive: true,
      });
      await userB.save();
      tokenB = generateTokenPair(userB).accessToken;
    }
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await User.deleteMany({ firebaseUid: /^TEST_NOTIF_M7_/ });
      await Notification.deleteMany({ title: /^TEST_NOTIF_/ });
      await mongoose.connection.close();
    }
  });

  describe('FCM Device Token Management Endpoints', () => {
    it('should register a new FCM device token for authenticated user', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const res = await request(app)
        .post('/api/v1/notifications/device-token')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ token: 'FCM_TOKEN_SAMPLE_A2' });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);

      const updatedUser = await User.findById(userA._id);
      expect(updatedUser.deviceTokens).toContain('FCM_TOKEN_SAMPLE_A2');
    });

    it('should prevent duplicate device token entries', async () => {
      if (mongoose.connection.readyState !== 1) return;

      await request(app)
        .post('/api/v1/notifications/device-token')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ token: 'FCM_TOKEN_SAMPLE_A2' });

      const updatedUser = await User.findById(userA._id);
      const tokenCount = updatedUser.deviceTokens.filter((t) => t === 'FCM_TOKEN_SAMPLE_A2').length;
      expect(tokenCount).toBe(1);
    });

    it('should remove specified device token on logout', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const res = await request(app)
        .delete('/api/v1/notifications/device-token')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ token: 'FCM_TOKEN_SAMPLE_A2' });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);

      const updatedUser = await User.findById(userA._id);
      expect(updatedUser.deviceTokens).not.toContain('FCM_TOKEN_SAMPLE_A2');
    });
  });

  describe('Notification Management & Read Status', () => {
    let createdNotifId;

    beforeAll(async () => {
      if (mongoose.connection.readyState === 1) {
        const notif = new Notification({
          user: userA._id,
          type: 'BLOOD_REQUEST',
          title: 'TEST_NOTIF_TITLE',
          body: 'Test emergency notification body',
          status: 'SENT',
        });
        await notif.save();
        createdNotifId = notif._id.toString();
      }
    });

    it('should retrieve user notifications and unread count', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const res = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body.data.notifications)).toBe(true);

      const countRes = await request(app)
        .get('/api/v1/notifications/unread-count')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(countRes.statusCode).toBe(200);
      expect(countRes.body.data.unreadCount).toBeGreaterThan(0);
    });

    it('should prevent User B from reading User A notification', async () => {
      if (mongoose.connection.readyState !== 1 || !createdNotifId) return;

      const res = await request(app)
        .post(`/api/v1/notifications/${createdNotifId}/read`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.statusCode).toBe(404); // Not found for user B
    });

    it('should allow User A to mark notification as read', async () => {
      if (mongoose.connection.readyState !== 1 || !createdNotifId) return;

      const res = await request(app)
        .post(`/api/v1/notifications/${createdNotifId}/read`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.notification.isRead).toBe(true);
    });
  });

  describe('SMS Alert Provider Abstraction', () => {
    it('should gracefully handle disabled SMS provider without throwing error', async () => {
      const result = await sendEmergencySMS('+919876543210', 'Emergency alert');
      expect(result).toHaveProperty('sent', false);
      expect(result).toHaveProperty('reason');
      expect(result.reason).toContain('disabled');
    });

    it('should reject invalid phone format for SMS', async () => {
      const result = await sendEmergencySMS('INVALID_PHONE', 'Emergency alert');
      expect(result.sent).toBe(false);
      expect(result.reason).toContain('Invalid phone number format');
    });
  });
});
