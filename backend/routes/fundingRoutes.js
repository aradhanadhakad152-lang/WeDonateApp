'use strict';

const express = require('express');
const router = express.Router();
const { getCampaigns, createDonation, getMyDonations } = require('../controllers/fundingController');
const authenticate = require('../middleware/authenticate');

// GET /api/v1/funding/campaigns
router.get('/campaigns', getCampaigns);

// POST /api/v1/funding/donate — Requires Authentication
router.post('/donate', authenticate, createDonation);

// GET /api/v1/funding/my-donations — Requires Authentication
router.get('/my-donations', authenticate, getMyDonations);

module.exports = router;
