'use strict';

const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const { authorizeRoles, authorizeOrganizationAccess } = require('../middleware/rbacMiddleware');
const {
  registerOrganization,
  loginOrganization,
  getMyOrganization,
  getOrganizationRequestsQueue,
  verifyRequestByHospital,
  rejectRequestByHospital,
} = require('../controllers/organizationController');

/**
 * Organization Routes
 * Base path: /api/v1/organizations
 */

// Public Registration & Login
router.post('/register', registerOrganization);
router.post('/login', loginOrganization);

// Protected Staff Portal Routes
router.get('/me', authenticate, getMyOrganization);
router.get('/requests', authenticate, authorizeRoles('HOSPITAL_MANAGER', 'BLOOD_BANK_MANAGER', 'ADMIN', 'SUPER_ADMIN'), getOrganizationRequestsQueue);

// Request Verification Workflow
router.patch('/requests/:id/verify', authenticate, authorizeRoles('HOSPITAL_MANAGER', 'BLOOD_BANK_MANAGER', 'ADMIN', 'SUPER_ADMIN'), verifyRequestByHospital);
router.patch('/requests/:id/reject', authenticate, authorizeRoles('HOSPITAL_MANAGER', 'BLOOD_BANK_MANAGER', 'ADMIN', 'SUPER_ADMIN'), rejectRequestByHospital);

module.exports = router;
