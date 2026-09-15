'use strict';

const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const { authorizeRoles } = require('../middleware/rbacMiddleware');
const {
  getAdminDashboardMetrics,
  getUsersList,
  getAdminDonorsList,
  getDonorDetailsHistory,
  updateUserStatus,
  updateUserAvailability,
  getOrganizationsList,
  searchGooglePlacesForOrganizations,
  registerOrganizationWithAccount,
  createOrganizationAccount,
  resetOrganizationAccountPassword,
  updateOrganizationAccountStatus,
  updateOrganizationStatus,
  getPendingRequestsForAdmin,
  getAllRequestsForAdmin,
  verifyRequestByAdmin,
  getAuditLogs,
  getWhatsAppConfigStatusController,
  getRequestNotificationHistory,
  retryRequestNotificationBatch,
  stopRequestNotificationCampaign,
  getPendingVerificationsQueue,
  getAdminDonations,
  createAdminDonationRecord,
  getAdminCampaigns,
  createAdminCampaign,
  getAdminReports,
  getAdminNotifications,
} = require('../controllers/adminController');

const { getAdminRevenueStats } = require('../controllers/serviceFeeController');

/**
 * System Admin Portal Routes
 * Base path: /api/v1/admin
 * All routes require authentication and SUPER_ADMIN or ADMIN role.
 */
router.use(authenticate);
router.use(authorizeRoles('SUPER_ADMIN', 'ADMIN'));

router.get('/dashboard', getAdminDashboardMetrics);
router.get('/revenue', getAdminRevenueStats);
router.get('/users', getUsersList);
router.get('/donors', getAdminDonorsList);
router.get('/donors/:id/history', getDonorDetailsHistory);
router.patch('/users/:id/status', updateUserStatus);
router.patch('/users/:id/availability', updateUserAvailability);
router.get('/organizations/search-places', searchGooglePlacesForOrganizations);
router.post('/organizations/register', registerOrganizationWithAccount);
router.get('/organizations', getOrganizationsList);
router.post('/organizations/:id/account', createOrganizationAccount);
router.post('/organizations/:id/account/reset-password', resetOrganizationAccountPassword);
router.post('/organizations/:id/reset-password', resetOrganizationAccountPassword);
router.post('/organizations/:id/set-password', resetOrganizationAccountPassword);
router.patch('/organizations/:id/account-status', updateOrganizationAccountStatus);
router.patch('/organizations/:id/status', updateOrganizationStatus);
router.get('/requests/pending', getPendingRequestsForAdmin);
router.get('/requests', getAllRequestsForAdmin);
router.patch('/requests/:id/verify', verifyRequestByAdmin);
router.get('/requests/:id/notifications', getRequestNotificationHistory);
router.post('/requests/:id/notifications/retry', retryRequestNotificationBatch);
router.post('/requests/:id/notifications/stop', stopRequestNotificationCampaign);
router.get('/audit-logs', getAuditLogs);
router.get('/whatsapp-config', getWhatsAppConfigStatusController);
router.get('/verifications', getPendingVerificationsQueue);
router.get('/donations', getAdminDonations);
router.post('/donations', createAdminDonationRecord);
router.get('/campaigns', getAdminCampaigns);
router.post('/campaigns', createAdminCampaign);
router.get('/reports', getAdminReports);
router.get('/notifications', getAdminNotifications);

module.exports = router;
