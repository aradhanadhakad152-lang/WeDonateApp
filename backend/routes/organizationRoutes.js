'use strict';

const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const { authorizeRoles } = require('../middleware/rbacMiddleware');
const {
  registerOrganization,
  loginOrganization,
  getMyOrganization,
  getOrganizationRequestsQueue,
  createHospitalBloodRequest,
  verifyRequestByHospital,
  rejectRequestByHospital,
  confirmDonorByHospital,
  completeDonationByHospital,
  updateMyOrganization,
  getOrganizationAuditLogs,
  listPublicOrganizations,
} = require('../controllers/organizationController');

/**
 * Organization (Hospital / Blood Bank) Portal Routes
 * Base path: /api/v1/organizations
 */

// Public Registration, Staff Login & Public Hospital Listing
router.post('/register', registerOrganization);
router.post('/login', loginOrganization);
router.get('/list', listPublicOrganizations);

// Authenticated Organization Staff Operations
router.get('/me', authenticate, authorizeRoles('HOSPITAL_MANAGER', 'BLOOD_BANK_MANAGER', 'HOSPITAL_STAFF', 'ADMIN', 'SUPER_ADMIN'), getMyOrganization);
router.patch('/me', authenticate, authorizeRoles('HOSPITAL_MANAGER', 'BLOOD_BANK_MANAGER', 'ADMIN', 'SUPER_ADMIN'), updateMyOrganization);
router.get('/requests', authenticate, authorizeRoles('HOSPITAL_MANAGER', 'BLOOD_BANK_MANAGER', 'HOSPITAL_STAFF', 'ADMIN', 'SUPER_ADMIN'), getOrganizationRequestsQueue);
router.post('/requests', authenticate, authorizeRoles('HOSPITAL_MANAGER', 'BLOOD_BANK_MANAGER', 'HOSPITAL_STAFF', 'ADMIN', 'SUPER_ADMIN'), createHospitalBloodRequest);
router.patch('/requests/:id/verify', authenticate, authorizeRoles('HOSPITAL_MANAGER', 'BLOOD_BANK_MANAGER', 'HOSPITAL_STAFF', 'ADMIN', 'SUPER_ADMIN'), verifyRequestByHospital);
router.patch('/requests/:id/reject', authenticate, authorizeRoles('HOSPITAL_MANAGER', 'BLOOD_BANK_MANAGER', 'HOSPITAL_STAFF', 'ADMIN', 'SUPER_ADMIN'), rejectRequestByHospital);
router.patch('/requests/:id/confirm-donor', authenticate, authorizeRoles('HOSPITAL_MANAGER', 'BLOOD_BANK_MANAGER', 'HOSPITAL_STAFF', 'ADMIN', 'SUPER_ADMIN'), confirmDonorByHospital);
router.patch('/requests/:id/complete', authenticate, authorizeRoles('HOSPITAL_MANAGER', 'BLOOD_BANK_MANAGER', 'HOSPITAL_STAFF', 'ADMIN', 'SUPER_ADMIN'), completeDonationByHospital);
router.get('/audit-logs', authenticate, authorizeRoles('HOSPITAL_MANAGER', 'BLOOD_BANK_MANAGER', 'HOSPITAL_STAFF', 'ADMIN', 'SUPER_ADMIN'), getOrganizationAuditLogs);

module.exports = router;
