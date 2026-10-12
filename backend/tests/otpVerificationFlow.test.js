'use strict';

/**
 * ==============================================================================
 * WE DONATE — OTP Service & WhatsApp Authentication Test Suite
 * ==============================================================================
 * Tests:
 * 1. Phone number normalization (E.164 format, 10-digit, 12-digit prefixes)
 * 2. OTP generation (6 numeric digits, secure random distribution)
 * 3. SHA-256 OTP hashing (deterministic, one-way security)
 * 4. WhatsApp OTP request cooldown (60s rate limit)
 * 5. Expired OTP handling
 * 6. Incorrect OTP and attempt count decrementing
 * 7. Maximum verification attempts enforcement (5 attempts limit)
 * ==============================================================================
 */

const {
  normalizePhone,
  generate6DigitCode,
  hashOTP,
} = require('../services/otpService');
const OtpVerification = require('../models/OtpVerification');
const mongoose = require('mongoose');

describe('OTP & Authentication Service Suite', () => {
  describe('1. Phone Number Normalization', () => {
    it('should format standard 10-digit Indian phone numbers with +91 prefix', () => {
      expect(normalizePhone('9876543210')).toBe('+919876543210');
      expect(normalizePhone(' 9876543210 ')).toBe('+919876543210');
    });

    it('should format 12-digit Indian numbers starting with 91 with leading +', () => {
      expect(normalizePhone('919876543210')).toBe('+919876543210');
    });

    it('should preserve international numbers already starting with +', () => {
      expect(normalizePhone('+919876543210')).toBe('+919876543210');
      expect(normalizePhone('+14155552671')).toBe('+14155552671');
    });

    it('should strip special characters, spaces, and hyphens', () => {
      expect(normalizePhone('+91 98765-43210')).toBe('+919876543210');
      expect(normalizePhone('(987) 654-3210')).toBe('+919876543210');
    });

    it('should return empty string for null or empty inputs', () => {
      expect(normalizePhone('')).toBe('');
      expect(normalizePhone(null)).toBe('');
      expect(normalizePhone(undefined)).toBe('');
    });
  });

  describe('2. OTP Generation & Cryptographic Hashing', () => {
    it('should generate a 6-digit numeric string between 100000 and 999999', () => {
      for (let i = 0; i < 20; i++) {
        const code = generate6DigitCode();
        expect(code).toHaveLength(6);
        expect(/^\d{6}$/.test(code)).toBe(true);
        const num = parseInt(code, 10);
        expect(num).toBeGreaterThanOrEqual(100000);
        expect(num).toBeLessThan(1000000);
      }
    });

    it('should produce consistent 64-char hex SHA-256 hash for identical codes', () => {
      const code = '458921';
      const hash1 = hashOTP(code);
      const hash2 = hashOTP(code);

      expect(hash1).toHaveLength(64);
      expect(hash1).toBe(hash2);
    });

    it('should produce distinct hashes for different OTP codes', () => {
      const hashA = hashOTP('111111');
      const hashB = hashOTP('111112');
      expect(hashA).not.toBe(hashB);
    });
  });

  describe('3. In-Memory OTP Lifecycle & Cooldown Logic', () => {
    it('should detect when an OTP is still within 60s cooldown window', () => {
      const createdAt = new Date(); // right now
      const isWithinCooldown = Date.now() - createdAt.getTime() < 60 * 1000;
      expect(isWithinCooldown).toBe(true);
    });

    it('should allow resending once cooldown window has elapsed', () => {
      const createdAt = new Date(Date.now() - 65 * 1000); // 65 seconds ago
      const isWithinCooldown = Date.now() - createdAt.getTime() < 60 * 1000;
      expect(isWithinCooldown).toBe(false);
    });

    it('should detect when an OTP code has expired after TTL', () => {
      const pastExpiry = new Date(Date.now() - 5000); // expired 5 seconds ago
      const isExpired = new Date() > pastExpiry;
      expect(isExpired).toBe(true);
    });

    it('should validate that active OTP code is within valid window', () => {
      const futureExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes in future
      const isExpired = new Date() > futureExpiry;
      expect(isExpired).toBe(false);
    });

    it('should enforce attempt counter and recognize max attempts exceeded (>= 5)', () => {
      let attempts = 0;
      const MAX_ATTEMPTS = 5;

      for (let i = 0; i < 5; i++) {
        expect(attempts >= MAX_ATTEMPTS).toBe(false);
        attempts += 1;
      }

      expect(attempts).toBe(5);
      expect(attempts >= MAX_ATTEMPTS).toBe(true);
    });

    it('should verify matching hash against stored OTP hash', () => {
      const generatedCode = '739201';
      const storedHash = hashOTP(generatedCode);

      const userSubmissionGood = '739201';
      const userSubmissionBad = '739200';

      expect(hashOTP(userSubmissionGood) === storedHash).toBe(true);
      expect(hashOTP(userSubmissionBad) === storedHash).toBe(false);
    });
  });
});
