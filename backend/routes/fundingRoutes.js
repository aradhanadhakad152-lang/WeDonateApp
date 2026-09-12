'use strict';

const express = require('express');
const router = express.Router();
const { getCampaigns, processFinancialContribution } = require('../controllers/fundingController');

/**
 * Funding & Donation Portal Routes
 * Base path: /api/v1/funding
 */

router.get('/campaigns', getCampaigns);
router.post('/donate', processFinancialContribution);

module.exports = router;
