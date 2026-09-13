'use strict';

const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const { createPaymentOrder, verifyPaymentSignature } = require('../controllers/serviceFeeController');

/**
 * Payment & Platform Service Fee Routes
 * Base path: /api/v1/payments
 */
router.post('/create-order', authenticate, createPaymentOrder);
router.post('/verify', authenticate, verifyPaymentSignature);

module.exports = router;
