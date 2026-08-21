'use strict';

const express = require('express');
const router = express.Router();

/**
 * Donor Routes
 * Base path: /api/v1/donors
 * Stubs — will be fully implemented in Milestone 6 (Nearby Donor Matching)
 */

// GET /api/v1/donors/nearby — find eligible nearby donors by blood group + location
router.get('/nearby', (req, res) => {
  res.status(501).json({ success: false, message: 'Not implemented — Milestone 6' });
});

module.exports = router;
