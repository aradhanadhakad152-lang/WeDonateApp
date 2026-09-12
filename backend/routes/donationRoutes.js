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
  getMyDonations
} = require('../controllers/donationController');

/**
 * Blood Donation Registration Routes
 * Base Path: /api/v1/donations
 */

router.post('/register', authenticate, registerDonation);
router.get('/my-donations', authenticate, getMyDonations);
router.get('/organization', authenticate, authorizeRoles('ORGANIZATION', 'HOSPITAL_MANAGER', 'BLOOD_BANK_MANAGER', 'ADMIN', 'SUPER_ADMIN'), getOrganizationDonationRegistrations);

router.patch('/:id/approve', authenticate, authorizeRoles('ORGANIZATION', 'HOSPITAL_MANAGER', 'BLOOD_BANK_MANAGER', 'ADMIN', 'SUPER_ADMIN'), approveDonationRegistration);
router.patch('/:id/complete', authenticate, authorizeRoles('ORGANIZATION', 'HOSPITAL_MANAGER', 'BLOOD_BANK_MANAGER', 'ADMIN', 'SUPER_ADMIN'), completeDonationRegistration);
router.patch('/:id/reject', authenticate, authorizeRoles('ORGANIZATION', 'HOSPITAL_MANAGER', 'BLOOD_BANK_MANAGER', 'ADMIN', 'SUPER_ADMIN'), rejectDonationRegistration);

module.exports = router;
