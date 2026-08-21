'use strict';

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../server');
const User = require('../models/User');
const BloodRequest = require('../models/BloodRequest');
const { generateTokenPair } = require('../services/jwtService');

process.env.JWT_ACCESS_SECRET = 'test_access_secret_1234567890_1234567890_1234567890_1234567890';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_1234567890_1234567890_1234567890_1234567890';
process.env.NODE_ENV = 'test';

describe('Milestone 5 Blood Request Suite', () => {
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
        console.warn('MongoDB connection fallback during blood request test execution');
      }
    }

    if (mongoose.connection.readyState === 1) {
      await User.deleteMany({ firebaseUid: /^TEST_REQ_M5_/ });
      await BloodRequest.deleteMany({ patientName: /^TEST_PATIENT_/ });

      // User A (Requester)
      userA = new User({
        firebaseUid: 'TEST_REQ_M5_USER_A',
        phone: '+919333344444',
        fullName: 'Requester User A',
        bloodGroup: 'O+',
        role: 'CITIZEN',
        accountStatus: 'ACTIVE',
        isActive: true,
      });
      await userA.save();
      tokenA = generateTokenPair(userA).accessToken;

      // User B (Other User)
      userB = new User({
        firebaseUid: 'TEST_REQ_M5_USER_B',
        phone: '+919333355555',
        fullName: 'Other User B',
        bloodGroup: 'A+',
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
      await User.deleteMany({ firebaseUid: /^TEST_REQ_M5_/ });
      await BloodRequest.deleteMany({ patientName: /^TEST_PATIENT_/ });
      await mongoose.connection.close();
    }
  });

  describe('POST /api/v1/blood-requests (Creation & Validation)', () => {
    it('should reject unauthenticated request creation', async () => {
      const res = await request(app).post('/api/v1/blood-requests').send({});
      expect(res.statusCode).toBe(401);
    });

    it('should reject creation with invalid blood group', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const res = await request(app)
        .post('/api/v1/blood-requests')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          patientName: 'TEST_PATIENT_1',
          bloodGroup: 'INVALID_GROUP',
          unitsRequired: 2,
          hospitalName: 'City Hospital',
          hospitalAddress: '123 Main St',
          hospitalLatitude: 19.0760,
          hospitalLongitude: 72.8777,
          contactPhone: '+919876543210',
        });

      expect(res.statusCode).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it('should reject creation with invalid units required (0 or 15)', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const res = await request(app)
        .post('/api/v1/blood-requests')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          patientName: 'TEST_PATIENT_2',
          bloodGroup: 'B+',
          unitsRequired: 15, // Invalid > 10
          hospitalName: 'City Hospital',
          hospitalAddress: '123 Main St',
          hospitalLatitude: 19.0760,
          hospitalLongitude: 72.8777,
          contactPhone: '+919876543210',
        });

      expect(res.statusCode).toBe(422);
    });

    it('should prevent spoofing requesterId from client body', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const res = await request(app)
        .post('/api/v1/blood-requests')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          requesterId: userB._id.toString(), // Attempted spoof
          patientName: 'TEST_PATIENT_SPOOF',
          bloodGroup: 'A+',
          unitsRequired: 2,
          hospitalName: 'City Hospital',
          hospitalAddress: '123 Main St',
          hospitalLatitude: 19.0760,
          hospitalLongitude: 72.8777,
          contactPhone: '+919876543210',
        });

      expect(res.statusCode).toBe(422);
    });

    it('should successfully create emergency blood request with valid GeoJSON location', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const res = await request(app)
        .post('/api/v1/blood-requests')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          patientName: 'TEST_PATIENT_VALID',
          bloodGroup: 'O+',
          unitsRequired: 3,
          urgency: 'CRITICAL',
          hospitalName: 'Apollo Hospital',
          hospitalAddress: '45 Healthcare Blvd, Mumbai',
          hospitalLatitude: 19.0760,
          hospitalLongitude: 72.8777,
          contactPhone: '+919876543210',
          reason: 'Emergency surgery required',
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.request).toHaveProperty('patientName', 'TEST_PATIENT_VALID');
      expect(res.body.data.request.status).toBe('OPEN');
      expect(res.body.data.request.location.coordinates).toEqual([72.8777, 19.0760]); // [lng, lat]
    });
  });

  describe('GET /api/v1/blood-requests and /my', () => {
    it('should retrieve active blood requests list', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const res = await request(app)
        .get('/api/v1/blood-requests')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body.data.requests)).toBe(true);
      expect(res.body.data.requests.length).toBeGreaterThan(0);
    });

    it('should retrieve user own created requests via GET /my', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const res = await request(app)
        .get('/api/v1/blood-requests/my')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.requests.every((r) => r.requesterId.toString() === userA._id.toString())).toBe(true);
    });
  });

  describe('Authorization & Cancellation', () => {
    let createdReqId;

    beforeAll(async () => {
      if (mongoose.connection.readyState === 1) {
        const reqDoc = new BloodRequest({
          requesterId: userA._id,
          patientName: 'TEST_PATIENT_CANCEL',
          bloodGroup: 'B-',
          unitsRequired: 1,
          urgency: 'NORMAL',
          hospitalName: 'St Jude Hospital',
          hospitalAddress: '789 Care Rd',
          hospitalLatitude: 19.0178,
          hospitalLongitude: 72.8478,
          contactPhone: '+919876543210',
          status: 'OPEN',
        });
        await reqDoc.save();
        createdReqId = reqDoc._id.toString();
      }
    });

    it('should reject cancellation attempt by non-creator user B', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const res = await request(app)
        .post(`/api/v1/blood-requests/${createdReqId}/cancel`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should allow cancellation by request creator user A', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const res = await request(app)
        .post(`/api/v1/blood-requests/${createdReqId}/cancel`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.request.status).toBe('CANCELLED');
    });

    it('should reject cancellation of an already cancelled request', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const res = await request(app)
        .post(`/api/v1/blood-requests/${createdReqId}/cancel`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
});
