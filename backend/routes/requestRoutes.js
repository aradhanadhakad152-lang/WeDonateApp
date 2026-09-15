'use strict';

const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const {
  validateCreateBloodRequest,
  validateUpdateBloodRequest,
} = require('../middleware/validate');
const {
  createRequest,
  getAllRequests,
  getAvailableRequests,
  getMyRequests,
  getRequestById,
  updateRequest,
  cancelRequest,
  respondToRequestByRequestId,
} = require('../controllers/requestController');

/**
 * Blood Request Routes
 * Base path: /api/v1/blood-requests
 */

// POST /api/v1/blood-requests — Create emergency blood request
router.post('/', authenticate, validateCreateBloodRequest, createRequest);

// GET /api/v1/blood-requests — List all active blood requests
router.get('/', authenticate, getAllRequests);

// GET /api/v1/blood-requests/available — Get nearby available blood requests for donor
router.get('/available', authenticate, getAvailableRequests);

// GET /api/v1/blood-requests/my — Get authenticated user's created requests
router.get('/my', authenticate, getMyRequests);

// POST /api/v1/blood-requests/:id/respond — Respond to blood request (I_CAN_DONATE / NOT_AVAILABLE)
router.post('/:id/respond', authenticate, respondToRequestByRequestId);

// GET /api/v1/blood-requests/:id — Get details of single blood request
router.get('/:id', authenticate, getRequestById);

// PATCH /api/v1/blood-requests/:id — Update request (Requester only)
router.patch('/:id', authenticate, validateUpdateBloodRequest, updateRequest);

// POST /api/v1/blood-requests/:id/cancel — Cancel blood request (Requester only)
router.post('/:id/cancel', authenticate, cancelRequest);

module.exports = router;
