'use strict';

const { body, query, param, validationResult } = require('express-validator');
const { sendError } = require('../utils/apiResponse');

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const GENDERS = ['MALE', 'FEMALE', 'OTHER'];
const DONOR_STATUSES = ['AVAILABLE', 'UNAVAILABLE', 'INELIGIBLE'];
const URGENCY_LEVELS = ['CRITICAL', 'URGENT', 'NORMAL'];

/**
 * Middleware to check validation results and return formatted error response.
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map((err) => ({
      field: err.path || err.param,
      message: err.msg,
    }));
    return sendError(res, {
      statusCode: 422,
      message: 'Input validation failed',
      errors: formattedErrors,
    });
  }
  next();
};

/**
 * Validation rules for PUT /api/v1/users/me (full profile update)
 */
const validateProfileUpdate = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  body('fullName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Full name must be between 2 and 100 characters'),
  body('email')
    .optional({ checkFalsy: true })
    .trim()
    .isEmail()
    .withMessage('Invalid email address'),
  body('bloodGroup')
    .optional()
    .isIn(BLOOD_GROUPS)
    .withMessage(`Blood group must be one of: ${BLOOD_GROUPS.join(', ')}`),
  body('gender')
    .optional({ checkFalsy: true })
    .isIn(GENDERS)
    .withMessage(`Gender must be one of: ${GENDERS.join(', ')}`),
  body('age')
    .optional({ checkFalsy: true })
    .isInt({ min: 18, max: 65 })
    .withMessage('Age must be an integer between 18 and 65'),
  body('dateOfBirth')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('Invalid date format for dateOfBirth'),
  body('lastDonationDate')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('Invalid date format for lastDonationDate'),
  body('isDonor')
    .optional()
    .isBoolean()
    .withMessage('isDonor must be a boolean'),
  body('donorStatus')
    .optional()
    .isIn(DONOR_STATUSES)
    .withMessage(`donorStatus must be one of: ${DONOR_STATUSES.join(', ')}`),
  body('isAvailable')
    .optional()
    .isBoolean()
    .withMessage('isAvailable must be a boolean'),

  body('location')
    .optional()
    .isObject()
    .withMessage('Location must be an object'),
  body('location.coordinates')
    .optional()
    .isArray({ min: 2, max: 2 })
    .withMessage('Location coordinates must be an array of [longitude, latitude]'),
  body('location.coordinates.*')
    .optional()
    .isNumeric()
    .withMessage('Coordinates must be numeric'),
  body('location.latitude')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),
  body('location.longitude')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180'),
  body('location.city')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('City name too long'),
  body('location.state')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('State name too long'),
  body('location.pincode')
    .optional()
    .trim()
    .isLength({ max: 10 })
    .withMessage('Pincode too long'),

  body('firebaseUid')
    .not()
    .exists()
    .withMessage('Modifying firebaseUid is not permitted'),
  body('role')
    .not()
    .exists()
    .withMessage('Modifying role via profile API is not permitted'),
  body('_id')
    .not()
    .exists()
    .withMessage('Modifying _id is not permitted'),

  handleValidationErrors,
];

/**
 * Validation rules for PATCH /api/v1/users/me (partial update)
 */
const validateProfilePatch = [
  body('isAvailable')
    .optional()
    .isBoolean()
    .withMessage('isAvailable must be a boolean'),
  body('donorStatus')
    .optional()
    .isIn(DONOR_STATUSES)
    .withMessage(`donorStatus must be one of: ${DONOR_STATUSES.join(', ')}`),
  body('deviceToken')
    .optional()
    .isString()
    .withMessage('deviceToken must be a string'),

  handleValidationErrors,
];

/**
 * Validation rules for PUT /api/v1/users/me/location
 */
const validateLocationUpdate = [
  body('latitude')
    .exists({ checkNull: true })
    .withMessage('Latitude is required')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be a valid number between -90 and 90'),
  body('longitude')
    .exists({ checkNull: true })
    .withMessage('Longitude is required')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be a valid number between -180 and 180'),
  body('address')
    .optional()
    .trim()
    .isLength({ max: 250 })
    .withMessage('Address cannot exceed 250 characters'),
  body('city')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('City name cannot exceed 100 characters'),
  body('state')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('State name cannot exceed 100 characters'),
  body('pincode')
    .optional()
    .trim()
    .isLength({ max: 10 })
    .withMessage('Pincode cannot exceed 10 characters'),

  handleValidationErrors,
];

/**
 * Validation rules for GET /api/v1/users/nearby
 */
const validateNearbySearch = [
  query('latitude')
    .exists({ checkNull: true })
    .withMessage('Latitude query parameter is required')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be a valid number between -90 and 90'),
  query('longitude')
    .exists({ checkNull: true })
    .withMessage('Longitude query parameter is required')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be a valid number between -180 and 180'),
  query('radius')
    .optional()
    .isFloat({ min: 0.1, max: 100 })
    .withMessage('Radius must be a number between 0.1 km and 100 km'),
  query('bloodGroup')
    .optional()
    .isIn(BLOOD_GROUPS)
    .withMessage(`Blood group filter must be one of: ${BLOOD_GROUPS.join(', ')}`),

  handleValidationErrors,
];

/**
 * Validation rules for POST /api/v1/blood-requests (Create Blood Request)
 */
const validateCreateBloodRequest = [
  body('patientName')
    .trim()
    .notEmpty()
    .withMessage('Patient name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Patient name must be between 2 and 100 characters'),
  body('bloodGroup')
    .notEmpty()
    .withMessage('Blood group is required')
    .isIn(BLOOD_GROUPS)
    .withMessage(`Blood group must be one of: ${BLOOD_GROUPS.join(', ')}`),
  body('unitsRequired')
    .notEmpty()
    .withMessage('Units required is required')
    .isInt({ min: 1, max: 10 })
    .withMessage('Units required must be an integer between 1 and 10'),
  body('hospitalName')
    .trim()
    .notEmpty()
    .withMessage('Hospital name is required')
    .isLength({ min: 2, max: 200 })
    .withMessage('Hospital name cannot exceed 200 characters'),
  body('hospitalAddress')
    .trim()
    .notEmpty()
    .withMessage('Hospital address is required')
    .isLength({ min: 5, max: 300 })
    .withMessage('Hospital address cannot exceed 300 characters'),
  body('hospitalLatitude')
    .exists({ checkNull: true })
    .withMessage('Hospital latitude is required')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Hospital latitude must be between -90 and 90'),
  body('hospitalLongitude')
    .exists({ checkNull: true })
    .withMessage('Hospital longitude is required')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Hospital longitude must be between -180 and 180'),
  body('urgency')
    .optional()
    .isIn(URGENCY_LEVELS)
    .withMessage(`Urgency must be one of: ${URGENCY_LEVELS.join(', ')}`),
  body('contactPhone')
    .trim()
    .notEmpty()
    .withMessage('Contact phone is required')
    .matches(/^\+[1-9]\d{7,14}$/)
    .withMessage('Contact phone must be in E.164 format (e.g. +919876543210)'),
  body('requiredBy')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('Invalid date format for requiredBy'),
  body('reason')
    .optional()
    .trim()
    .isLength({ max: 300 })
    .withMessage('Reason cannot exceed 300 characters'),
  body('additionalNotes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Additional notes cannot exceed 500 characters'),

  // Reject attempts to spoof security fields
  body('requesterId').not().exists().withMessage('Client cannot specify requesterId'),
  body('acceptedDonorId').not().exists().withMessage('Client cannot specify acceptedDonorId'),
  body('status').not().exists().withMessage('Client cannot specify initial status'),
  body('fulfilledAt').not().exists().withMessage('Client cannot specify fulfilledAt'),
  body('cancelledAt').not().exists().withMessage('Client cannot specify cancelledAt'),
  body('_id').not().exists().withMessage('Client cannot specify _id'),

  handleValidationErrors,
];

/**
 * Validation rules for PATCH /api/v1/blood-requests/:id (Update Blood Request)
 */
const validateUpdateBloodRequest = [
  param('id')
    .isMongoId()
    .withMessage('Invalid blood request ID format'),
  body('patientName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 }),
  body('bloodGroup')
    .optional()
    .isIn(BLOOD_GROUPS),
  body('unitsRequired')
    .optional()
    .isInt({ min: 1, max: 10 }),
  body('urgency')
    .optional()
    .isIn(URGENCY_LEVELS),
  body('hospitalName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 200 }),
  body('hospitalAddress')
    .optional()
    .trim()
    .isLength({ min: 5, max: 300 }),
  body('hospitalLatitude')
    .optional()
    .isFloat({ min: -90, max: 90 }),
  body('hospitalLongitude')
    .optional()
    .isFloat({ min: -180, max: 180 }),

  // Reject unauthorized security modifications
  body('requesterId').not().exists().withMessage('Client cannot modify requesterId'),
  body('acceptedDonorId').not().exists().withMessage('Client cannot modify acceptedDonorId'),
  body('status').not().exists().withMessage('Use dedicated status endpoints to change status'),
  body('fulfilledAt').not().exists().withMessage('Client cannot modify fulfilledAt'),
  body('cancelledAt').not().exists().withMessage('Client cannot modify cancelledAt'),

  handleValidationErrors,
];

module.exports = {
  validateProfileUpdate,
  validateProfilePatch,
  validateLocationUpdate,
  validateNearbySearch,
  validateCreateBloodRequest,
  validateUpdateBloodRequest,
};
