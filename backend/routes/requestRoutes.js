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
  getMyRequests,
  getRequestById,
  updateRequest,
  cancelRequest,
} = require('../controllers/requestController');

/**
 * Blood Request Routes
 * Base path: /api/v1/blood-requests
 */

// POST /api/v1/blood-requests — Create emergency blood request
router.post('/', authenticate, validateCreateBloodRequest, createRequest);

// GET /api/v1/blood-requests — List all active blood requests
router.get('/', authenticate, getAllRequests);

// GET /api/v1/blood-requests/my — Get authenticated user's created requests
router.get('/my', authenticate, getMyRequests);

// GET /api/v1/blood-requests/:id — Get details of single blood request
router.get('/:id', authenticate, getRequestById);

// PATCH /api/v1/blood-requests/:id — Update request (Requester only)
router.patch('/:id', authenticate, validateUpdateBloodRequest, updateRequest);

// POST /api/v1/blood-requests/:id/cancel — Cancel blood request (Requester only)
router.post('/:id/cancel', authenticate, cancelRequest);

module.exports = router;
