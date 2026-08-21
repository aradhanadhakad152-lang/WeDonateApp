'use strict';

const User = require('../models/User');
const { checkEligibility } = require('../services/eligibilityService');
const { calculateDistanceKm, formatDistance } = require('../utils/distance');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../utils/logger');

/**
 * User Controller — Production Grade (Milestone 4 Location & Distance Extensions)
 */

// GET /api/v1/users/me
const getProfile = asyncHandler(async (req, res) => {
  const user = req.user;
  return sendSuccess(res, {
    statusCode: 200,
    message: 'User profile retrieved successfully',
    data: {
      user: user.toProfileJSON(),
    },
  });
});

// PUT /api/v1/users/me — Full profile update
const updateProfile = asyncHandler(async (req, res) => {
  const user = req.user;
  const {
    name,
    fullName,
    email,
    profilePhoto,
    gender,
    age,
    dateOfBirth,
    bloodGroup,
    isDonor,
    donorStatus,
    lastDonationDate,
    location,
    deviceToken,
  } = req.body;

  // Name & contact
  if (name !== undefined) user.name = name;
  if (fullName !== undefined) user.fullName = fullName;
  if (email !== undefined) user.email = email || null;
  if (profilePhoto !== undefined) user.profilePhoto = profilePhoto;
  if (gender !== undefined) user.gender = gender;
  if (age !== undefined) user.age = age;
  if (dateOfBirth !== undefined) user.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : null;

  // Donation info
  if (bloodGroup !== undefined) user.bloodGroup = bloodGroup;
  if (isDonor !== undefined) user.isDonor = isDonor;
  if (donorStatus !== undefined) user.donorStatus = donorStatus;
  if (lastDonationDate !== undefined) user.lastDonationDate = lastDonationDate ? new Date(lastDonationDate) : null;

  // Device token
  if (deviceToken !== undefined) {
    user.deviceToken = deviceToken;
    if (deviceToken && !user.deviceTokens.includes(deviceToken)) {
      user.deviceTokens.push(deviceToken);
    }
  }

  // Location handling
  if (location && typeof location === 'object') {
    let coords = user.location?.coordinates || [0, 0];

    // GeoJSON order: [longitude, latitude]
    if (Array.isArray(location.coordinates) && location.coordinates.length === 2) {
      coords = [Number(location.coordinates[0]), Number(location.coordinates[1])];
    } else if (location.latitude !== undefined && location.longitude !== undefined) {
      coords = [Number(location.longitude), Number(location.latitude)];
    }

    user.location = {
      type: 'Point',
      coordinates: coords,
      address: location.address !== undefined ? location.address : user.location?.address || '',
      city: location.city !== undefined ? location.city : user.location?.city || '',
      state: location.state !== undefined ? location.state : user.location?.state || '',
      pincode: location.pincode !== undefined ? location.pincode : user.location?.pincode || '',
      accuracy: location.accuracy !== undefined ? location.accuracy : user.location?.accuracy || null,
      updatedAt: new Date(),
    };
  }

  // Recalculate eligibility server-side
  const eligibilityResult = checkEligibility(user);
  user.isEligible = eligibilityResult.isEligible;
  if (eligibilityResult.nextEligibleDate) {
    user.nextEligibleDonationDate = eligibilityResult.nextEligibleDate;
  }

  await user.save();

  logger.info(`User profile updated successfully: ${user._id}`);

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Profile updated successfully',
    data: {
      user: user.toProfileJSON(),
    },
  });
});

// PUT /api/v1/users/me/location — Dedicated Location Update Endpoint
const updateLocation = asyncHandler(async (req, res) => {
  const user = req.user;
  const { latitude, longitude, address, city, state, pincode, accuracy } = req.body;

  const lat = Number(latitude);
  const lng = Number(longitude);

  // GeoJSON Point: [longitude, latitude]
  user.location = {
    type: 'Point',
    coordinates: [lng, lat],
    address: address !== undefined ? address : user.location?.address || '',
    city: city !== undefined ? city : user.location?.city || '',
    state: state !== undefined ? state : user.location?.state || '',
    pincode: pincode !== undefined ? pincode : user.location?.pincode || '',
    accuracy: accuracy !== undefined ? Number(accuracy) : user.location?.accuracy || null,
    updatedAt: new Date(),
  };

  await user.save();

  logger.info(`Updated GPS location for user: ${user._id} ([${lng}, ${lat}])`);

  return sendSuccess(res, {
    statusCode: 200,
    message: 'User location updated successfully',
    data: {
      location: {
        latitude: lat,
        longitude: lng,
        coordinates: [lng, lat],
        address: user.location.address,
        city: user.location.city,
        state: user.location.state,
        pincode: user.location.pincode,
        accuracy: user.location.accuracy,
        updatedAt: user.location.updatedAt,
      },
    },
  });
});

// GET /api/v1/users/nearby — Nearby Donors Discovery with Haversine Distance Sorting
const getNearbyUsers = asyncHandler(async (req, res) => {
  const targetLat = Number(req.query.latitude);
  const targetLng = Number(req.query.longitude);
  const radiusKm = Number(req.query.radius) || 10; // Default 10 km radius
  const bloodGroupFilter = req.query.bloodGroup;

  // Earth radius in kilometers for MongoDB $centerSphere query
  const EARTH_RADIUS_KM = 6378.1;
  const radiusInRadians = radiusKm / EARTH_RADIUS_KM;

  // Construct MongoDB geospatial query
  const query = {
    _id: { $ne: req.user._id }, // Exclude requesting user
    isActive: true,
    accountStatus: 'ACTIVE',
    isDonor: true,
    donorStatus: 'AVAILABLE',
    'location.coordinates': {
      $geoWithin: {
        $centerSphere: [[targetLng, targetLat], radiusInRadians],
      },
    },
  };

  if (bloodGroupFilter) {
    query.bloodGroup = bloodGroupFilter;
  }

  const nearbyDonors = await User.find(query).exec();

  // Calculate exact Haversine distance and sort nearest first
  const results = nearbyDonors
    .map((donor) => {
      const donorLng = donor.location.coordinates[0];
      const donorLat = donor.location.coordinates[1];
      const distanceKm = calculateDistanceKm(targetLat, targetLng, donorLat, donorLng);

      const publicInfo = donor.toPublicJSON();

      return {
        ...publicInfo,
        distanceKm,
        formattedDistance: formatDistance(distanceKm),
      };
    })
    .filter((donor) => donor.distanceKm <= radiusKm) // Filter exact distance
    .sort((a, b) => a.distanceKm - b.distanceKm);     // Sort nearest first

  return sendSuccess(res, {
    statusCode: 200,
    message: `Found ${results.length} nearby donor(s) within ${radiusKm} km`,
    data: {
      donors: results,
      searchCenter: {
        latitude: targetLat,
        longitude: targetLng,
        radiusKm,
      },
      total: results.length,
    },
  });
});

// PATCH /api/v1/users/me — Partial profile update
const patchProfile = asyncHandler(async (req, res) => {
  const user = req.user;
  const { isAvailable, donorStatus, deviceToken } = req.body;

  if (isAvailable !== undefined) {
    user.isAvailable = isAvailable;
  }
  if (donorStatus !== undefined) {
    user.donorStatus = donorStatus;
  }
  if (deviceToken !== undefined) {
    user.deviceToken = deviceToken;
  }

  await user.save();

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Profile status updated successfully',
    data: {
      user: user.toProfileJSON(),
    },
  });
});

// DELETE /api/v1/users/me — Deactivate user profile / account
const deleteProfile = asyncHandler(async (req, res) => {
  const user = req.user;

  user.isActive = false;
  user.accountStatus = 'SUSPENDED';
  user.refreshTokenHashes = [];
  user.deviceToken = null;
  user.deviceTokens = [];

  await user.save();

  logger.info(`User account deactivated: ${user._id}`);

  return sendSuccess(res, {
    statusCode: 200,
    message: 'User account deactivated successfully',
  });
});

module.exports = {
  getProfile,
  updateProfile,
  updateLocation,
  getNearbyUsers,
  patchProfile,
  deleteProfile,
};
