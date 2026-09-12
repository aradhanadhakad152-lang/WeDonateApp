'use strict';

const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const { authorizeRoles } = require('../middleware/rbacMiddleware');
const {
  getAdminDashboardMetrics,
  getOrganizationsList,
  updateOrganizationStatus,
  getPendingRequestsForAdmin,
  verifyRequestByAdmin,
  getAuditLogs,
} = require('../controllers/adminController');

/**
 * Admin Portal Routes
 * Base path: /api/v1/admin
 */

router.use(authenticate);
router.use(authorizeRoles('ADMIN', 'SUPER_ADMIN'));

router.get('/dashboard', getAdminDashboardMetrics);
router.get('/organizations', getOrganizationsList);
router.patch('/organizations/:id/status', updateOrganizationStatus);

router.get('/requests/pending', getPendingRequestsForAdmin);
router.patch('/requests/:id/verify', verifyRequestByAdmin);

router.get('/audit-logs', getAuditLogs);

module.exports = router;
