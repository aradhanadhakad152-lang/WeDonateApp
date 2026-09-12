'use strict';

const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const { authorizeRoles } = require('../middleware/rbacMiddleware');
const {
  registerDonation,
  getOrganizationDonationRegistrations,
  approveDonationRegistration,
  completeDonationRegistration,
  rejectDonationRegistration,
  getMyDonations,
} = require('../controllers/donationController');

/**
 * Blood Donation Registrations & Workflow Routes
 * Base path: /api/v1/donations
 */

// Citizen endpoints
router.post('/register', authenticate, registerDonation);
router.get('/my-donations', authenticate, getMyDonations);

// Organization Staff endpoints
router.get(
  '/organization',
  authenticate,
  authorizeRoles('HOSPITAL_MANAGER', 'BLOOD_BANK_MANAGER', 'HOSPITAL_STAFF', 'ADMIN', 'SUPER_ADMIN'),
  getOrganizationDonationRegistrations
);

router.patch(
  '/:id/approve',
  authenticate,
  authorizeRoles('HOSPITAL_MANAGER', 'BLOOD_BANK_MANAGER', 'HOSPITAL_STAFF', 'ADMIN', 'SUPER_ADMIN'),
  approveDonationRegistration
);

router.patch(
  '/:id/complete',
  authenticate,
  authorizeRoles('HOSPITAL_MANAGER', 'BLOOD_BANK_MANAGER', 'HOSPITAL_STAFF', 'ADMIN', 'SUPER_ADMIN'),
  completeDonationRegistration
);

router.patch(
  '/:id/reject',
  authenticate,
  authorizeRoles('HOSPITAL_MANAGER', 'BLOOD_BANK_MANAGER', 'HOSPITAL_STAFF', 'ADMIN', 'SUPER_ADMIN'),
  rejectDonationRegistration
);

module.exports = router;
