'use strict';

const express = require('express');
const router = express.Router();
const {
  autocompleteHospitals,
  getNearbyHospitals,
  getNearbyBloodBanks,
  getHospitalByPlaceId,
} = require('../controllers/hospitalController');

/**
 * Hospital & Places Discovery Routes
 * Base path: /api/v1/hospitals
 */

router.get('/autocomplete', autocompleteHospitals);
router.get('/nearby', getNearbyHospitals);
router.get('/blood-banks', getNearbyBloodBanks);
router.get('/:placeId', getHospitalByPlaceId);

module.exports = router;
