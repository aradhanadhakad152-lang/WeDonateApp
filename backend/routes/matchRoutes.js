'use strict';

const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const {
  getNearbyMatchesForRequest,
  assignMatchesForRequest,
  acceptMatch,
  rejectMatch,
  getMyMatches,
  respondToMatch,
  getMatchById,
} = require('../controllers/matchController');

const { respondToRequestByRequestId } = require('../controllers/requestController');

/**
 * Match Routes
 * Base path: /api/v1/matches
 */

// GET /api/v1/matches/my — Get matched opportunities for authenticated donor
router.get('/my', authenticate, getMyMatches);

// GET /api/v1/matches/nearby/:requestId — Get nearby matches for blood request
router.get('/nearby/:requestId', authenticate, getNearbyMatchesForRequest);

// POST /api/v1/matches/:requestId/assign — Run donor matching engine
router.post('/:requestId/assign', authenticate, assignMatchesForRequest);

// POST /api/v1/matches/request/:requestId/respond — Respond to request by request ID
router.post('/request/:requestId/respond', authenticate, respondToRequestByRequestId);

// POST /api/v1/matches/:matchId/accept — Accept donor match
router.post('/:matchId/accept', authenticate, acceptMatch);

// POST /api/v1/matches/:matchId/reject — Reject donor match
router.post('/:matchId/reject', authenticate, rejectMatch);

// PATCH /api/v1/matches/:matchId/respond — Respond to donor match (ACCEPT / REJECT)
router.patch('/:matchId/respond', authenticate, respondToMatch);

// GET /api/v1/matches/:matchId — Get details of single match
router.get('/:matchId', authenticate, getMatchById);

module.exports = router;
