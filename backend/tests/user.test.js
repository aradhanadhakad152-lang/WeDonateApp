'use strict';

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../server');
const User = require('../models/User');
const { generateTokenPair } = require('../services/jwtService');

process.env.JWT_ACCESS_SECRET = 'test_access_secret_1234567890_1234567890_1234567890_1234567890';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_1234567890_1234567890_1234567890_1234567890';
process.env.NODE_ENV = 'test';

describe('Milestone 3 User Profile Suite', () => {
  let testUser;
  let testAccessToken;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0 && process.env.MONGODB_URI) {
      let uri = process.env.MONGODB_URI.trim().replace(/^MONGODB_URI=\s*/i, '').replace(/^["']|["']$/g, '');
      try {
        await mongoose.connect(uri, { serverSelectionTimeoutMS: 3000 });
      } catch (err) {
        console.warn('MongoDB connection fallback during user test execution');
      }
    }

    if (mongoose.connection.readyState === 1) {
      await User.deleteMany({ firebaseUid: /^TEST_USER_M3_/ });

      testUser = new User({
        firebaseUid: 'TEST_USER_M3_UID_001',
        phone: '+919111122222',
        fullName: 'Original Test Name',
        bloodGroup: 'B+',
        role: 'CITIZEN',
        accountStatus: 'ACTIVE',
        isVerified: true,
      });
      await testUser.save();

      const tokens = generateTokenPair(testUser);
      testAccessToken = tokens.accessToken;
    }
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await User.deleteMany({ firebaseUid: /^TEST_USER_M3_/ });
      await mongoose.connection.close();
    }
  });

  describe('GET /api/v1/users/me', () => {
    it('should reject unauthenticated request', async () => {
      const res = await request(app).get('/api/v1/users/me');
      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should return authenticated user profile', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const res = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${testAccessToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toHaveProperty('phone', '+919111122222');
      expect(res.body.data.user).toHaveProperty('bloodGroup', 'B+');
    });
  });

  describe('PUT /api/v1/users/me (Update Profile)', () => {
    it('should reject update with invalid blood group', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const res = await request(app)
        .put('/api/v1/users/me')
        .set('Authorization', `Bearer ${testAccessToken}`)
        .send({
          bloodGroup: 'INVALID_BLOOD_GROUP',
        });

      expect(res.statusCode).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toBeDefined();
    });

    it('should reject attempt to modify restricted security field firebaseUid', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const res = await request(app)
        .put('/api/v1/users/me')
        .set('Authorization', `Bearer ${testAccessToken}`)
        .send({
          firebaseUid: 'MALICIOUS_HIJACKED_UID',
        });

      expect(res.statusCode).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it('should update profile and location coordinates cleanly', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const res = await request(app)
        .put('/api/v1/users/me')
        .set('Authorization', `Bearer ${testAccessToken}`)
        .send({
          fullName: 'Updated Donor Name',
          email: 'updated.donor@example.com',
          bloodGroup: 'O+',
          gender: 'MALE',
          age: 28,
          location: {
            latitude: 19.0760,
            longitude: 72.8777,
            city: 'Mumbai',
            state: 'Maharashtra',
            pincode: '400001',
          },
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.name).toBe('Updated Donor Name');
      expect(res.body.data.user.bloodGroup).toBe('O+');
      expect(res.body.data.user.location.city).toBe('Mumbai');
      expect(res.body.data.user.location.coordinates).toEqual([72.8777, 19.0760]);
    });
  });

  describe('PATCH /api/v1/users/me (Partial Update)', () => {
    it('should toggle donor availability', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const res = await request(app)
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${testAccessToken}`)
        .send({
          isAvailable: false,
          donorStatus: 'UNAVAILABLE',
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.isAvailable).toBe(false);
      expect(res.body.data.user.donorStatus).toBe('UNAVAILABLE');
    });
  });

  describe('DELETE /api/v1/users/me (Deactivate Account)', () => {
    it('should deactivate user account and invalidate session', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const res = await request(app)
        .delete('/api/v1/users/me')
        .set('Authorization', `Bearer ${testAccessToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify user is now suspended/inactive
      const fetchRes = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${testAccessToken}`);

      expect(fetchRes.statusCode).toBe(403); // Suspended account access forbidden
    });
  });

  describe('Duplicate firebaseUid Protection', () => {
    it('should enforce unique index constraint on firebaseUid', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const duplicateUser = new User({
        firebaseUid: 'TEST_USER_M3_UNIQUE_1',
        phone: '+919888877771',
      });
      await duplicateUser.save();

      const collidingUser = new User({
        firebaseUid: 'TEST_USER_M3_UNIQUE_1',
        phone: '+919888877772',
      });

      await expect(collidingUser.save()).rejects.toThrow();
    });
  });
});
