'use strict';

const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const { authorizeRoles } = require('../middleware/rbacMiddleware');
const {
  getAdminDashboardMetrics,
  getUsersList,
  updateUserStatus,
  updateUserAvailability,
  getOrganizationsList,
  updateOrganizationStatus,
  getPendingRequestsForAdmin,
  getAllRequestsForAdmin,
  verifyRequestByAdmin,
  getAuditLogs,
  getWhatsAppConfigStatusController,
} = require('../controllers/adminController');

/**
 * System Admin Portal Routes
 * Base path: /api/v1/admin
 * All routes require authentication and SUPER_ADMIN or ADMIN role.
 */
router.use(authenticate);
router.use(authorizeRoles('SUPER_ADMIN', 'ADMIN'));

router.get('/dashboard', getAdminDashboardMetrics);
router.get('/users', getUsersList);
router.patch('/users/:id/status', updateUserStatus);
router.patch('/users/:id/availability', updateUserAvailability);
router.get('/organizations', getOrganizationsList);
router.patch('/organizations/:id/status', updateOrganizationStatus);
router.post('/organizations/:id/set-password', require('../controllers/organizationController').setOrganizationPassword);
router.get('/requests/pending', getPendingRequestsForAdmin);
router.get('/requests', getAllRequestsForAdmin);
router.patch('/requests/:id/verify', verifyRequestByAdmin);
router.get('/audit-logs', getAuditLogs);
router.get('/whatsapp-config', getWhatsAppConfigStatusController);

module.exports = router;
