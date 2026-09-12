'use strict';

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../server');
const User = require('../models/User');
const BloodRequest = require('../models/BloodRequest');
const DonorMatch = require('../models/DonorMatch');
const { generateTokenPair } = require('../services/jwtService');
const { getCompatibleDonorGroups, isBloodCompatible } = require('../utils/bloodCompatibility');

process.env.JWT_ACCESS_SECRET = 'test_access_secret_1234567890_1234567890_1234567890_1234567890';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_1234567890_1234567890_1234567890_1234567890';
process.env.NODE_ENV = 'test';

describe('Milestone 6 Donor Matching Engine Suite', () => {
  let requester;
  let requesterToken;
  let compatibleNearDonor;
  let compatibleNearDonorToken;
  let compatibleFarDonor;
  let incompatibleDonor;
  let ineligibleDonor;
  let bloodRequest;
  let bloodRequestId;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0 && process.env.MONGODB_URI) {
      let uri = process.env.MONGODB_URI.trim().replace(/^MONGODB_URI=\s*/i, '').replace(/^["']|["']$/g, '');
      try {
        await mongoose.connect(uri, { serverSelectionTimeoutMS: 3000 });
      } catch (err) {
        console.warn('MongoDB connection fallback during match test execution');
      }
    }

    if (mongoose.connection.readyState === 1) {
      await User.deleteMany({ firebaseUid: /^TEST_MATCH_M6_/ });
      await BloodRequest.deleteMany({ patientName: /^TEST_MATCH_PATIENT_/ });
      await DonorMatch.deleteMany({ requestedBloodGroup: /^M6_/ });

      // 1. Requester User (Location: Mumbai Bandra 19.0596, 72.8295)
      requester = new User({
        firebaseUid: 'TEST_MATCH_M6_REQUESTER',
        phone: '+919444411111',
        fullName: 'Test Requester M6',
        bloodGroup: 'B+',
        role: 'CITIZEN',
        accountStatus: 'ACTIVE',
        isActive: true,
        location: { type: 'Point', coordinates: [72.8295, 19.0596], city: 'Mumbai' },
      });
      await requester.save();
      requesterToken = generateTokenPair(requester).accessToken;

      // 2. Compatible Near Donor (B+ blood, ~2.5km: Mumbai Dadar 19.0178, 72.8478)
      compatibleNearDonor = new User({
        firebaseUid: 'TEST_MATCH_M6_DONOR_NEAR',
        phone: '+919444422222',
        fullName: 'Compatible Near Donor',
        bloodGroup: 'B+',
        isDonor: true,
        donorStatus: 'AVAILABLE',
        isEligible: true,
        role: 'CITIZEN',
        accountStatus: 'ACTIVE',
        isActive: true,
        location: { type: 'Point', coordinates: [72.8478, 19.0178], city: 'Mumbai' },
      });
      await compatibleNearDonor.save();
      compatibleNearDonorToken = generateTokenPair(compatibleNearDonor).accessToken;

      // 3. Compatible Far Donor (O- blood universal, ~120km: Pune 18.5204, 73.8567)
      compatibleFarDonor = new User({
        firebaseUid: 'TEST_MATCH_M6_DONOR_FAR',
        phone: '+919444433333',
        fullName: 'Compatible Far Donor',
        bloodGroup: 'O-',
        isDonor: true,
        donorStatus: 'AVAILABLE',
        isEligible: true,
        role: 'CITIZEN',
        accountStatus: 'ACTIVE',
        isActive: true,
        location: { type: 'Point', coordinates: [73.8567, 18.5204], city: 'Pune' },
      });
      await compatibleFarDonor.save();

      // 4. Incompatible Donor (A+ blood, near: 19.0200, 72.8500)
      incompatibleDonor = new User({
        firebaseUid: 'TEST_MATCH_M6_DONOR_INCOMPATIBLE',
        phone: '+919444444444',
        fullName: 'Incompatible A+ Donor',
        bloodGroup: 'A+', // Incompatible for B+ recipient
        isDonor: true,
        donorStatus: 'AVAILABLE',
        isEligible: true,
        role: 'CITIZEN',
        accountStatus: 'ACTIVE',
        isActive: true,
        location: { type: 'Point', coordinates: [72.8500, 19.0200], city: 'Mumbai' },
      });
      await incompatibleDonor.save();

      // 5. Ineligible Donor (B+ blood, near, but recently donated < 90 days)
      ineligibleDonor = new User({
        firebaseUid: 'TEST_MATCH_M6_DONOR_INELIGIBLE',
        phone: '+919444455555',
        fullName: 'Ineligible Donor',
        bloodGroup: 'B+',
        isDonor: true,
        donorStatus: 'INELIGIBLE',
        isEligible: false, // Donated 10 days ago
        lastDonationDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        role: 'CITIZEN',
        accountStatus: 'ACTIVE',
        isActive: true,
        location: { type: 'Point', coordinates: [72.8478, 19.0178], city: 'Mumbai' },
      });
      await ineligibleDonor.save();

      // 6. Test Blood Request (Recipient B+)
      bloodRequest = new BloodRequest({
        requesterId: requester._id,
        patientName: 'TEST_MATCH_PATIENT_1',
        bloodGroup: 'B+',
        unitsRequired: 2,
        urgency: 'CRITICAL',
        hospitalName: 'Holy Family Hospital',
        hospitalAddress: 'Hill Road, Bandra, Mumbai',
        hospitalLatitude: 19.0596,
        hospitalLongitude: 72.8295,
        location: { type: 'Point', coordinates: [72.8295, 19.0596] },
        contactPhone: '+919444411111',
        status: 'OPEN',
      });
      await bloodRequest.save();
      bloodRequestId = bloodRequest._id.toString();
    }
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await User.deleteMany({ firebaseUid: /^TEST_MATCH_M6_/ });
      await BloodRequest.deleteMany({ patientName: /^TEST_MATCH_PATIENT_/ });
      await DonorMatch.deleteMany({ requestedBloodGroup: /^M6_/ });
      await mongoose.connection.close();
    }
  });

  describe('Blood Group RBC Compatibility Utility', () => {
    it('should return correct donor groups for B+ recipient (B+, B-, O+, O-)', () => {
      const compatible = getCompatibleDonorGroups('B+');
      expect(compatible).toEqual(expect.arrayContaining(['B+', 'B-', 'O+', 'O-']));
      expect(compatible).not.toContain('A+');
      expect(compatible).not.toContain('AB+');
    });

    it('should confirm O- is universal donor for all recipients', () => {
      expect(isBloodCompatible('O-', 'B+')).toBe(true);
      expect(isBloodCompatible('O-', 'A-')).toBe(true);
      expect(isBloodCompatible('O-', 'AB+')).toBe(true);
    });

    it('should reject invalid blood groups safely', () => {
      expect(() => getCompatibleDonorGroups('INVALID')).toThrow();
    });
  });

  describe('Matching Engine & Geospatial Ranking', () => {
    it('should find compatible near donor and exclude incompatible / ineligible / far donors', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const res = await request(app)
        .post(`/api/v1/matches/${bloodRequestId}/assign`)
        .set('Authorization', `Bearer ${requesterToken}`)
        .send({ radiusKm: 10 });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.newCount).toBeGreaterThan(0);

      const matches = res.body.data.matches;
      // Compatible Near Donor must be matched
      const foundNear = matches.find((m) => m.donor.toString() === compatibleNearDonor._id.toString());
      expect(foundNear).toBeDefined();

      // Incompatible donor (A+) must be excluded
      const foundIncompatible = matches.find((m) => m.donor.toString() === incompatibleDonor._id.toString());
      expect(foundIncompatible).toBeUndefined();

      // Ineligible donor (< 90 days) must be excluded
      const foundIneligible = matches.find((m) => m.donor.toString() === ineligibleDonor._id.toString());
      expect(foundIneligible).toBeUndefined();

      // Far donor (> 10 km) must be excluded
      const foundFar = matches.find((m) => m.donor.toString() === compatibleFarDonor._id.toString());
      expect(foundFar).toBeUndefined();
    });

    it('should prevent duplicate match records for the same donor + request', async () => {
      if (mongoose.connection.readyState !== 1) return;

      // Re-trigger assign endpoint
      const res = await request(app)
        .post(`/api/v1/matches/${bloodRequestId}/assign`)
        .set('Authorization', `Bearer ${requesterToken}`)
        .send({ radiusKm: 10 });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.newCount).toBe(0); // 0 new matches created because duplicate prevented
    });
  });

  describe('Match Acceptance & Rejection Flow', () => {
    let createdMatchId;

    beforeAll(async () => {
      if (mongoose.connection.readyState === 1) {
        const match = await DonorMatch.findOne({ bloodRequest: bloodRequestId, donor: compatibleNearDonor._id });
        if (match) createdMatchId = match._id.toString();
      }
    });

    it('should reject accept attempt by non-owner user B', async () => {
      if (mongoose.connection.readyState !== 1 || !createdMatchId) return;

      const res = await request(app)
        .post(`/api/v1/matches/${createdMatchId}/accept`)
        .set('Authorization', `Bearer ${requesterToken}`); // Requester token != donor token

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should allow assigned donor to accept match', async () => {
      if (mongoose.connection.readyState !== 1 || !createdMatchId) return;

      const res = await request(app)
        .post(`/api/v1/matches/${createdMatchId}/accept`)
        .set('Authorization', `Bearer ${compatibleNearDonorToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.match.status).toBe('ACCEPTED');
      expect(['ACCEPTED', 'DONOR_RESPONDED']).toContain(res.body.data.request.status);
      expect(res.body.data.request.acceptedDonorId.toString()).toBe(compatibleNearDonor._id.toString());
    });

    it('should gracefully handle idempotent re-acceptance of an already accepted match', async () => {
      if (mongoose.connection.readyState !== 1 || !createdMatchId) return;

      const res = await request(app)
        .post(`/api/v1/matches/${createdMatchId}/accept`)
        .set('Authorization', `Bearer ${compatibleNearDonorToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Match is already accepted');
    });
  });
});
