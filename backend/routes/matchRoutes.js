'use strict';

const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const {
  getNearbyMatchesForRequest,
  assignMatchesForRequest,
  acceptMatch,
  rejectMatch,
  getMatchById,
} = require('../controllers/matchController');

/**
 * Match Routes
 * Base path: /api/v1/matches
 */

// GET /api/v1/matches/nearby/:requestId — Get nearby matches for blood request
router.get('/nearby/:requestId', authenticate, getNearbyMatchesForRequest);

// POST /api/v1/matches/:requestId/assign — Run donor matching engine
router.post('/:requestId/assign', authenticate, assignMatchesForRequest);

// POST /api/v1/matches/:matchId/accept — Accept donor match
router.post('/:matchId/accept', authenticate, acceptMatch);

// POST /api/v1/matches/:matchId/reject — Reject donor match
router.post('/:matchId/reject', authenticate, rejectMatch);

// GET /api/v1/matches/:matchId — Get details of single match
router.get('/:matchId', authenticate, getMatchById);

module.exports = router;
