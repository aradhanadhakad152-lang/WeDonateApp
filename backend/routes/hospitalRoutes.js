'use strict';

const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const {
  autocompleteHospitals,
  getNearbyHospitals,
  getNearbyBloodBanks,
  getHospitalByPlaceId,
} = require('../controllers/hospitalController');

/**
 * Hospital & Places API Proxy Routes
 * Base path: /api/v1/hospitals
 */

// GET /api/v1/hospitals/autocomplete?input=AIIMS&latitude=28.5672&longitude=77.2100
router.get('/autocomplete', authenticate, autocompleteHospitals);

// GET /api/v1/hospitals/nearby?latitude=28.5672&longitude=77.2100&radius=10
router.get('/nearby', authenticate, getNearbyHospitals);

// GET /api/v1/hospitals/blood-banks?latitude=28.5672&longitude=77.2100&radius=10
router.get('/blood-banks', authenticate, getNearbyBloodBanks);

// GET /api/v1/hospitals/:placeId
router.get('/:placeId', authenticate, getHospitalByPlaceId);

module.exports = router;
