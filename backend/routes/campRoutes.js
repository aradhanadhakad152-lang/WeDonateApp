'use strict';

const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const { authorizeRoles } = require('../middleware/rbacMiddleware');
const {
  createCamp,
  getCamps,
  registerForCamp,
  getCampRegistrations,
  submitCampResults,
} = require('../controllers/campController');

/**
 * Donation Camp Routes
 * Base path: /api/v1/camps
 */

router.get('/', getCamps);
router.post('/', authenticate, authorizeRoles('HOSPITAL_MANAGER', 'BLOOD_BANK_MANAGER', 'CAMP_ORGANIZER', 'ADMIN', 'SUPER_ADMIN'), createCamp);
router.post('/:id/register', authenticate, registerForCamp);
router.get('/:id/registrations', authenticate, authorizeRoles('HOSPITAL_MANAGER', 'BLOOD_BANK_MANAGER', 'CAMP_ORGANIZER', 'ADMIN', 'SUPER_ADMIN'), getCampRegistrations);
router.post('/:id/results', authenticate, authorizeRoles('HOSPITAL_MANAGER', 'BLOOD_BANK_MANAGER', 'CAMP_ORGANIZER', 'ADMIN', 'SUPER_ADMIN'), submitCampResults);

module.exports = router;
