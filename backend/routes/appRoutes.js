'use strict';

const express = require('express');
const router = express.Router();
const { getAppVersion } = require('../controllers/appController');

/**
 * App Routes
 * Base path: /api/v1/app
 */

// GET /api/v1/app/version
router.get('/version', getAppVersion);

module.exports = router;
