'use strict';

const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const {
  validateProfileUpdate,
  validateProfilePatch,
  validateLocationUpdate,
  validateNearbySearch,
} = require('../middleware/validate');
const {
  getProfile,
  updateProfile,
  updateLocation,
  getNearbyUsers,
  patchProfile,
  deleteProfile,
} = require('../controllers/userController');

/**
 * User Routes
 * Base path: /api/v1/users
 */

// GET /api/v1/users/me — Get authenticated user's profile
router.get('/me', authenticate, getProfile);

// PUT /api/v1/users/me — Update authenticated user's profile
router.put('/me', authenticate, validateProfileUpdate, updateProfile);

// PUT /api/v1/users/me/location — Dedicated location update API
router.put('/me/location', authenticate, validateLocationUpdate, updateLocation);

// GET /api/v1/users/nearby — Nearby donor discovery within radius
router.get('/nearby', authenticate, validateNearbySearch, getNearbyUsers);

// PATCH /api/v1/users/me — Partial update / status toggle
router.patch('/me', authenticate, validateProfilePatch, patchProfile);

// DELETE /api/v1/users/me — Deactivate user account
router.delete('/me', authenticate, deleteProfile);

module.exports = router;
