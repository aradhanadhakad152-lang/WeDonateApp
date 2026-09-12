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
  verifyRequestByHospital,
  rejectRequestByHospital,
  updateMyOrganization,
  getOrganizationAuditLogs,
} = require('../controllers/organizationController');

/**
 * Organization (Hospital / Blood Bank) Portal Routes
 * Base path: /api/v1/organizations
 */

// Public Registration & Staff Login
router.post('/register', registerOrganization);
router.post('/login', loginOrganization);

// Authenticated Organization Staff Operations
router.get('/me', authenticate, authorizeRoles('HOSPITAL_MANAGER', 'BLOOD_BANK_MANAGER', 'HOSPITAL_STAFF', 'ADMIN', 'SUPER_ADMIN'), getMyOrganization);
router.patch('/me', authenticate, authorizeRoles('HOSPITAL_MANAGER', 'BLOOD_BANK_MANAGER', 'ADMIN', 'SUPER_ADMIN'), updateMyOrganization);
router.get('/requests', authenticate, authorizeRoles('HOSPITAL_MANAGER', 'BLOOD_BANK_MANAGER', 'HOSPITAL_STAFF', 'ADMIN', 'SUPER_ADMIN'), getOrganizationRequestsQueue);
router.patch('/requests/:id/verify', authenticate, authorizeRoles('HOSPITAL_MANAGER', 'BLOOD_BANK_MANAGER', 'HOSPITAL_STAFF', 'ADMIN', 'SUPER_ADMIN'), verifyRequestByHospital);
router.patch('/requests/:id/reject', authenticate, authorizeRoles('HOSPITAL_MANAGER', 'BLOOD_BANK_MANAGER', 'HOSPITAL_STAFF', 'ADMIN', 'SUPER_ADMIN'), rejectRequestByHospital);
router.get('/audit-logs', authenticate, authorizeRoles('HOSPITAL_MANAGER', 'BLOOD_BANK_MANAGER', 'HOSPITAL_STAFF', 'ADMIN', 'SUPER_ADMIN'), getOrganizationAuditLogs);

module.exports = router;
