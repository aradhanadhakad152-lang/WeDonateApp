'use strict';

const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const { authorizeRoles, authorizeOrganizationAccess } = require('../middleware/rbacMiddleware');
const {
  getOrganizationInventory,
  updateOrganizationInventory,
} = require('../controllers/inventoryController');

/**
 * Blood Inventory Routes
 * Base path: /api/v1/inventory
 */

router.get('/:organizationId', getOrganizationInventory);
router.put('/:organizationId', authenticate, authorizeRoles('HOSPITAL_MANAGER', 'BLOOD_BANK_MANAGER', 'ADMIN', 'SUPER_ADMIN'), authorizeOrganizationAccess, updateOrganizationInventory);

module.exports = router;
