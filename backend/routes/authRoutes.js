'use strict';

const express = require('express');
const router = express.Router();
const { authLimiter } = require('../middleware/rateLimiter');
const authenticate = require('../middleware/authenticate');
const { firebaseLogin, refreshToken, logout, devLogin, adminLogin } = require('../controllers/authController');

/**
 * Auth Routes
 * Base path: /api/v1/auth
 */

// POST /api/v1/auth/firebase-login
// Accepts Firebase ID Token in Authorization header (Bearer <ID_TOKEN>), verifies with Admin SDK, returns JWT pair
router.post('/firebase-login', authLimiter, firebaseLogin);

// POST /api/v1/auth/dev-login
// Development testing endpoint (Disabled in production)
router.post('/dev-login', authLimiter, devLogin);

// POST /api/v1/auth/admin-login
// Production Admin portal login endpoint
router.post('/admin-login', authLimiter, adminLogin);

// POST /api/v1/auth/refresh
// Accepts refresh token, verifies signature and SHA-256 hash match, returns rotated token pair
router.post('/refresh', authLimiter, refreshToken);

// POST /api/v1/auth/logout
// Requires JWT Access Token, revokes refresh token hash
router.post('/logout', authenticate, logout);

module.exports = router;
