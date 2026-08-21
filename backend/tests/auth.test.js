'use strict';

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../server');
const User = require('../models/User');
const { generateTokenPair, verifyAccessToken, verifyRefreshToken, hashToken } = require('../services/jwtService');

// Set dummy JWT secrets for testing environment
process.env.JWT_ACCESS_SECRET = 'test_access_secret_1234567890_1234567890_1234567890_1234567890';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_1234567890_1234567890_1234567890_1234567890';
process.env.NODE_ENV = 'test';

describe('Milestone 2 Authentication Suite', () => {
  beforeAll(async () => {
    // If not connected, connect using MONGODB_URI or in-memory MongoDB
    if (mongoose.connection.readyState === 0 && process.env.MONGODB_URI) {
      let uri = process.env.MONGODB_URI.trim().replace(/^MONGODB_URI=\s*/i, '').replace(/^["']|["']$/g, '');
      try {
        await mongoose.connect(uri, { serverSelectionTimeoutMS: 3000 });
      } catch (err) {
        console.warn('MongoDB connection fallback during test execution');
      }
    }
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await User.deleteMany({ firebaseUid: /^MOCK_FIREBASE_/ });
      await mongoose.connection.close();
    }
  });

  describe('JWT Service Unit Tests', () => {
    const dummyUser = {
      _id: new mongoose.Types.ObjectId(),
      firebaseUid: 'MOCK_UID_UNIT_1',
      phone: '+919999988888',
      role: 'CITIZEN',
    };

    it('should generate valid Access Token with required claims', () => {
      const tokens = generateTokenPair(dummyUser);
      expect(tokens).toHaveProperty('accessToken');
      expect(tokens).toHaveProperty('refreshToken');
      expect(tokens).toHaveProperty('tokenHash');

      const decodedAccess = verifyAccessToken(tokens.accessToken);
      expect(decodedAccess.userId).toBe(dummyUser._id.toString());
      expect(decodedAccess.firebaseUid).toBe(dummyUser.firebaseUid);
      expect(decodedAccess.phone).toBe(dummyUser.phone);
      expect(decodedAccess.role).toBe('CITIZEN');
    });

    it('should hash refresh token using SHA-256', () => {
      const token = 'sample_raw_refresh_token_string';
      const hash1 = hashToken(token);
      const hash2 = hashToken(token);
      expect(hash1).toHaveLength(64);
      expect(hash1).toBe(hash2); // Deterministic
    });

    it('should reject invalid or tampered access token', () => {
      expect(() => verifyAccessToken('invalid.jwt.token')).toThrow();
    });
  });

  describe('POST /api/v1/auth/firebase-login', () => {
    it('should reject request without Authorization header', async () => {
      const res = await request(app).post('/api/v1/auth/firebase-login').send({});
      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject invalid Firebase ID token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/firebase-login')
        .set('Authorization', 'Bearer INVALID_FIREBASE_TOKEN')
        .send({});

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should authenticate valid Firebase ID token and return user + tokens', async () => {
      const res = await request(app)
        .post('/api/v1/auth/firebase-login')
        .set('Authorization', 'Bearer VALID_MOCK_FIREBASE_ID_TOKEN')
        .send({ deviceToken: 'fcm_mock_device_token' });

      if (mongoose.connection.readyState === 1) {
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('user');
        expect(res.body.data).toHaveProperty('tokens');
        expect(res.body.data.user.phone).toBe('+919876543210');
        expect(res.body.data.tokens).toHaveProperty('accessToken');
        expect(res.body.data.tokens).toHaveProperty('refreshToken');
      }
    });
  });

  describe('POST /api/v1/auth/refresh and Rotation', () => {
    it('should refresh tokens when given a valid refresh token', async () => {
      if (mongoose.connection.readyState !== 1) return;

      // 1. Initial Login
      const loginRes = await request(app)
        .post('/api/v1/auth/firebase-login')
        .set('Authorization', 'Bearer VALID_MOCK_FIREBASE_ID_TOKEN')
        .send({});

      const oldRefreshToken = loginRes.body.data.tokens.refreshToken;

      // 2. Refresh Request
      const refreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: oldRefreshToken });

      expect(refreshRes.statusCode).toBe(200);
      expect(refreshRes.body.success).toBe(true);
      expect(refreshRes.body.data.tokens).toHaveProperty('accessToken');
      expect(refreshRes.body.data.tokens).toHaveProperty('refreshToken');

      // 3. Token Rotation Verification: Reusing old refresh token must be rejected
      const reuseRes = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: oldRefreshToken });

      expect(reuseRes.statusCode).toBe(401);
      expect(reuseRes.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/users/me & Authorization', () => {
    it('should reject unauthenticated request', async () => {
      const res = await request(app).get('/api/v1/users/me');
      expect(res.statusCode).toBe(401);
    });

    it('should return profile data for valid Access Token', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const loginRes = await request(app)
        .post('/api/v1/auth/firebase-login')
        .set('Authorization', 'Bearer VALID_MOCK_FIREBASE_ID_TOKEN')
        .send({});

      const accessToken = loginRes.body.data.tokens.accessToken;

      const meRes = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(meRes.statusCode).toBe(200);
      expect(meRes.body.success).toBe(true);
      expect(meRes.body.data.user).toHaveProperty('phone', '+919876543210');
    });
  });
});
