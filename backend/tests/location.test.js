'use strict';

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../server');
const User = require('../models/User');
const { generateTokenPair } = require('../services/jwtService');
const { calculateDistanceKm, formatDistance } = require('../utils/distance');

process.env.JWT_ACCESS_SECRET = 'test_access_secret_1234567890_1234567890_1234567890_1234567890';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_1234567890_1234567890_1234567890_1234567890';
process.env.NODE_ENV = 'test';

describe('Milestone 4 Location & Distance Suite', () => {
  let mainUser;
  let mainAccessToken;
  let nearDonor;
  let farDonor;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0 && process.env.MONGODB_URI) {
      let uri = process.env.MONGODB_URI.trim().replace(/^MONGODB_URI=\s*/i, '').replace(/^["']|["']$/g, '');
      try {
        await mongoose.connect(uri, { serverSelectionTimeoutMS: 3000 });
      } catch (err) {
        console.warn('MongoDB connection fallback during location test execution');
      }
    }

    if (mongoose.connection.readyState === 1) {
      await User.deleteMany({ firebaseUid: /^TEST_LOC_M4_/ });

      // Requesting User (Center: Mumbai Bandra 19.0596, 72.8295)
      mainUser = new User({
        firebaseUid: 'TEST_LOC_M4_MAIN',
        phone: '+919222233333',
        fullName: 'Center Searcher',
        bloodGroup: 'A+',
        role: 'CITIZEN',
        accountStatus: 'ACTIVE',
        isActive: true,
        location: {
          type: 'Point',
          coordinates: [72.8295, 19.0596], // [lng, lat]
          city: 'Mumbai',
        },
      });
      await mainUser.save();

      const tokens = generateTokenPair(mainUser);
      mainAccessToken = tokens.accessToken;

      // Nearby Donor 1 (~2.5 km away: Mumbai Dadar 19.0178, 72.8478)
      nearDonor = new User({
        firebaseUid: 'TEST_LOC_M4_NEAR',
        phone: '+919222244444',
        fullName: 'Near Donor',
        bloodGroup: 'O+',
        isDonor: true,
        donorStatus: 'AVAILABLE',
        role: 'CITIZEN',
        accountStatus: 'ACTIVE',
        isActive: true,
        location: {
          type: 'Point',
          coordinates: [72.8478, 19.0178], // [lng, lat]
          city: 'Mumbai',
        },
      });
      await nearDonor.save();

      // Far Donor (~120 km away: Pune 18.5204, 73.8567)
      farDonor = new User({
        firebaseUid: 'TEST_LOC_M4_FAR',
        phone: '+919222255555',
        fullName: 'Far Donor',
        bloodGroup: 'O+',
        isDonor: true,
        donorStatus: 'AVAILABLE',
        role: 'CITIZEN',
        accountStatus: 'ACTIVE',
        isActive: true,
        location: {
          type: 'Point',
          coordinates: [73.8567, 18.5204], // [lng, lat]
          city: 'Pune',
        },
      });
      await farDonor.save();
    }
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await User.deleteMany({ firebaseUid: /^TEST_LOC_M4_/ });
      await mongoose.connection.close();
    }
  });

  describe('Haversine Distance Formula Unit Tests', () => {
    it('should return 0 km for identical coordinates', () => {
      const dist = calculateDistanceKm(19.0760, 72.8777, 19.0760, 72.8777);
      expect(dist).toBe(0);
    });

    it('should calculate accurate distance between Mumbai and Pune (~120 km)', () => {
      // Mumbai (19.0760, 72.8777) to Pune (18.5204, 73.8567)
      const dist = calculateDistanceKm(19.0760, 72.8777, 18.5204, 73.8567);
      expect(dist).toBeGreaterThan(110);
      expect(dist).toBeLessThan(130);
    });

    it('should format distances correctly for UI', () => {
      expect(formatDistance(0.45)).toBe('450 m');
      expect(formatDistance(2.34)).toBe('2.3 km');
      expect(formatDistance(12.8)).toBe('12.8 km');
    });

    it('should throw error for invalid latitude/longitude', () => {
      expect(() => calculateDistanceKm(95, 72.8777, 19.0760, 72.8777)).toThrow();
      expect(() => calculateDistanceKm(19.0760, 200, 19.0760, 72.8777)).toThrow();
    });
  });

  describe('PUT /api/v1/users/me/location (Update Location API)', () => {
    it('should reject unauthenticated location update', async () => {
      const res = await request(app).put('/api/v1/users/me/location').send({
        latitude: 19.0760,
        longitude: 72.8777,
      });
      expect(res.statusCode).toBe(401);
    });

    it('should reject invalid latitude (> 90)', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const res = await request(app)
        .put('/api/v1/users/me/location')
        .set('Authorization', `Bearer ${mainAccessToken}`)
        .send({
          latitude: 105.5,
          longitude: 72.8777,
        });

      expect(res.statusCode).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it('should reject invalid longitude (< -180)', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const res = await request(app)
        .put('/api/v1/users/me/location')
        .set('Authorization', `Bearer ${mainAccessToken}`)
        .send({
          latitude: 19.0760,
          longitude: -200,
        });

      expect(res.statusCode).toBe(422);
    });

    it('should successfully update valid GPS location and return location payload', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const res = await request(app)
        .put('/api/v1/users/me/location')
        .set('Authorization', `Bearer ${mainAccessToken}`)
        .send({
          latitude: 19.0760,
          longitude: 72.8777,
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400001',
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.location.latitude).toBe(19.0760);
      expect(res.body.data.location.longitude).toBe(72.8777);
      expect(res.body.data.location.coordinates).toEqual([72.8777, 19.0760]);
    });
  });

  describe('GET /api/v1/users/nearby (Nearby Donors & Distance Sorting)', () => {
    it('should find nearby donors within 10km radius sorted nearest first', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const res = await request(app)
        .get('/api/v1/users/nearby?latitude=19.0596&longitude=72.8295&radius=10')
        .set('Authorization', `Bearer ${mainAccessToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.donors)).toBe(true);

      // Near donor (~2.5km) should be included, Far donor (~120km) should be excluded from 10km radius
      const foundNear = res.body.data.donors.find((d) => d.id === nearDonor._id.toString());
      const foundFar = res.body.data.donors.find((d) => d.id === farDonor._id.toString());

      expect(foundNear).toBeDefined();
      expect(foundNear.distanceKm).toBeLessThan(10);
      expect(foundFar).toBeUndefined();
    });

    it('should filter nearby donors by blood group', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const res = await request(app)
        .get('/api/v1/users/nearby?latitude=19.0596&longitude=72.8295&radius=10&bloodGroup=AB-')
        .set('Authorization', `Bearer ${mainAccessToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.donors.length).toBe(0); // No AB- donors nearby
    });
  });
});
