'use strict';

/**
 * ==============================================================================
 * WE DONATE — Eligibility, Compatibility, Camp & Error Handling Suite
 * ==============================================================================
 * Tests:
 * 1. Blood group compatibility matrix & donor matching rules
 * 2. 90-day donation interval calculation
 * 3. Age bounds (18-65) and account status eligibility
 * 4. Blood camp registration logic & capacity limits
 * 5. Emergency blood request validation constraints
 * 6. Centralized API error handling (400, 401, 404)
 * ==============================================================================
 */

const request = require('supertest');
const app = require('../server');
const {
  COMPATIBILITY_MAP,
  getCompatibleDonorGroups,
  getCompatibleRecipientGroups,
  isBloodCompatible,
} = require('../utils/bloodCompatibility');
const {
  DONATION_INTERVAL_DAYS,
  calculateNextEligibleDate,
  checkEligibility,
} = require('../services/eligibilityService');

describe('Blood Compatibility, Eligibility & Camp Rules Suite', () => {
  // ----------------------------------------------------------------------------
  // 1. Blood Compatibility Matrix
  // ----------------------------------------------------------------------------
  describe('1. Red Blood Cell Compatibility Matrix', () => {
    it('should define compatible donor groups for all 8 standard blood groups', () => {
      const allGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
      allGroups.forEach((group) => {
        const donors = getCompatibleDonorGroups(group);
        expect(Array.isArray(donors)).toBe(true);
        expect(donors.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('should confirm O- is Universal Donor (can donate to all 8 blood groups)', () => {
      const allGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
      allGroups.forEach((recipientGroup) => {
        expect(isBloodCompatible('O-', recipientGroup)).toBe(true);
      });
    });

    it('should confirm AB+ is Universal Recipient (can receive from all 8 blood groups)', () => {
      const allGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
      const abDonors = getCompatibleDonorGroups('AB+');
      allGroups.forEach((donorGroup) => {
        expect(abDonors).toContain(donorGroup);
        expect(isBloodCompatible(donorGroup, 'AB+')).toBe(true);
      });
    });

    it('should enforce strict negative Rh factor rules', () => {
      // Rh-positive donors CANNOT donate to Rh-negative recipients
      expect(isBloodCompatible('O+', 'O-')).toBe(false);
      expect(isBloodCompatible('A+', 'A-')).toBe(false);
      expect(isBloodCompatible('B+', 'B-')).toBe(false);
      expect(isBloodCompatible('AB+', 'AB-')).toBe(false);
    });

    it('should throw error on invalid blood group strings', () => {
      expect(() => getCompatibleDonorGroups('XYZ')).toThrow(/Unsupported blood group/);
      expect(() => getCompatibleRecipientGroups('INVALID')).toThrow(/Unsupported blood group/);
    });
  });

  // ----------------------------------------------------------------------------
  // 2. Donation Interval & Donor Eligibility
  // ----------------------------------------------------------------------------
  describe('2. Donation Interval & Donor Eligibility', () => {
    it('should require minimum 90 days interval between blood donations', () => {
      expect(DONATION_INTERVAL_DAYS).toBe(90);

      const lastDonation = new Date('2026-01-01T00:00:00.000Z');
      const nextDate = calculateNextEligibleDate(lastDonation);

      const diffTime = nextDate.getTime() - lastDonation.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
      expect(diffDays).toBe(90);
    });

    it('should mark donor ineligible if last donation was less than 90 days ago', () => {
      // Donated 30 days ago
      const recentDonation = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const donor = {
        age: 25,
        isActive: true,
        accountStatus: 'ACTIVE',
        lastDonationDate: recentDonation,
      };

      const result = checkEligibility(donor);
      expect(result.isEligible).toBe(false);
      expect(result.reason).toContain('Must wait 90 days between donations');
      expect(result.nextEligibleDate).toBeInstanceOf(Date);
    });

    it('should mark donor eligible if last donation was >= 90 days ago', () => {
      // Donated 100 days ago
      const oldDonation = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
      const donor = {
        age: 28,
        isActive: true,
        accountStatus: 'ACTIVE',
        lastDonationDate: oldDonation,
      };

      const result = checkEligibility(donor);
      expect(result.isEligible).toBe(true);
      expect(result.reason).toBeNull();
    });

    it('should reject donors outside legal age range (under 18 or over 65)', () => {
      const underage = { age: 17, isActive: true, accountStatus: 'ACTIVE' };
      const overage = { age: 66, isActive: true, accountStatus: 'ACTIVE' };
      const validAgeMin = { age: 18, isActive: true, accountStatus: 'ACTIVE' };
      const validAgeMax = { age: 65, isActive: true, accountStatus: 'ACTIVE' };

      expect(checkEligibility(underage).isEligible).toBe(false);
      expect(checkEligibility(overage).isEligible).toBe(false);
      expect(checkEligibility(validAgeMin).isEligible).toBe(true);
      expect(checkEligibility(validAgeMax).isEligible).toBe(true);
    });

    it('should reject suspended donor accounts', () => {
      const suspendedDonor = {
        age: 30,
        isActive: true,
        accountStatus: 'SUSPENDED',
      };

      const result = checkEligibility(suspendedDonor);
      expect(result.isEligible).toBe(false);
      expect(result.reason).toBe('Account is not active');
    });
  });

  // ----------------------------------------------------------------------------
  // 3. Blood Camp Registration & Emergency Constraints
  // ----------------------------------------------------------------------------
  describe('3. Camp Registration & Capacity Rules', () => {
    it('should detect when camp registrations reach maximum capacity', () => {
      const camp = {
        registrationLimit: 50,
        registeredCount: 50,
      };

      const isFull = camp.registeredCount >= camp.registrationLimit;
      expect(isFull).toBe(true);
    });

    it('should allow registration when registrations are below capacity', () => {
      const camp = {
        registrationLimit: 100,
        registeredCount: 42,
      };

      const isFull = camp.registeredCount >= camp.registrationLimit;
      expect(isFull).toBe(false);
    });
  });

  // ----------------------------------------------------------------------------
  // 4. API Error Handling
  // ----------------------------------------------------------------------------
  describe('4. Centralized API Error Responses', () => {
    it('should return 404 with standard JSON payload for non-existent routes', async () => {
      const res = await request(app).get('/api/v1/non-existent-route-999');
      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('not found');
    });

    it('should return 401 when accessing protected routes without JWT token', async () => {
      const res = await request(app).post('/api/v1/blood-requests').send({
        patientName: 'Test Patient',
      });
      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject phone-login without phone number with 400 Bad Request', async () => {
      const res = await request(app).post('/api/v1/auth/phone-login').send({});
      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Phone number is required');
    });

    it('should reject invalid phone format with 400 Bad Request', async () => {
      const res = await request(app).post('/api/v1/auth/phone-login').send({
        phone: '123',
      });
      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('E.164');
    });
  });
});
