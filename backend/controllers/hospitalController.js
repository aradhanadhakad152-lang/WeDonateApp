'use strict';

const axios = require('axios');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { calculateDistanceKm, formatDistance } = require('../utils/distance');
const logger = require('../utils/logger');

/**
 * Hospital Controller — Production Grade Google Places API (New) Server Proxy
 *
 * SECURITY & ARCHITECTURE:
 * - Google Places API (New) is the single source of truth for hospital data.
 * - Reads process.env.GOOGLE_MAPS_API_KEY dynamically on every request.
 * - API keys are kept strictly on the backend and never exposed to mobile clients.
 * - Returns structured API error responses if Google API is missing or fails.
 * - No fake or hardcoded mock hospital fallback data.
 */

const getApiKey = () => {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key || key === 'your_google_maps_api_key_here') {
    return null;
  }
  return key;
};

// GET /api/v1/hospitals/autocomplete?input=AIIMS&latitude=28.5672&longitude=77.2100
const autocompleteHospitals = asyncHandler(async (req, res) => {
  const { input, latitude, longitude } = req.query;

  if (!input || typeof input !== 'string' || input.trim().length < 2) {
    return sendSuccess(res, {
      statusCode: 200,
      message: 'Suggestions empty for short input',
      data: { suggestions: [], attribution: 'Powered by Google' },
    });
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    return sendError(res, {
      statusCode: 503,
      message: 'Google Places API key is not configured on server (GOOGLE_MAPS_API_KEY missing)',
    });
  }

  const userLat = Number(latitude) || 28.5672;
  const userLng = Number(longitude) || 77.2100;

  try {
    const response = await axios.post(
      'https://places.googleapis.com/v1/places:autocomplete',
      {
        input: input.trim(),
        includedPrimaryTypes: ['hospital', 'medical_clinic', 'doctor'],
        locationBias: {
          circle: {
            center: { latitude: userLat, longitude: userLng },
            radius: 50000.0,
          },
        },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
        },
        timeout: 8000,
      }
    );

    const suggestions = (response.data.suggestions || []).map((s) => {
      const p = s.placePrediction || {};
      return {
        placeId: p.placeId || p.place || '',
        name: p.structuredFormat?.mainText?.text || p.text?.text || input.trim(),
        address: p.structuredFormat?.secondaryText?.text || p.text?.text || '',
        fullText: p.text?.text || '',
      };
    });

    return sendSuccess(res, {
      statusCode: 200,
      message: `Found ${suggestions.length} hospital suggestion(s) from Google Places`,
      data: { suggestions, attribution: 'Powered by Google' },
    });
  } catch (googleError) {
    const errMsg = googleError.response?.data?.error?.message || googleError.message;
    logger.error(`Google Places Autocomplete error: ${errMsg}`);
    return sendError(res, {
      statusCode: 502,
      message: 'Failed to retrieve hospital suggestions from Google Places API',
      error: errMsg,
    });
  }
});

// GET /api/v1/hospitals/nearby?latitude=28.5672&longitude=77.2100&radius=10
const getNearbyHospitals = asyncHandler(async (req, res) => {
  const { latitude, longitude, radius } = req.query;

  if (!latitude || !longitude) {
    return sendError(res, {
      statusCode: 400,
      message: 'Latitude and longitude query parameters are required',
    });
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    return sendError(res, {
      statusCode: 503,
      message: 'Google Places API key is not configured on server (GOOGLE_MAPS_API_KEY missing)',
    });
  }

  const userLat = Number(latitude);
  const userLng = Number(longitude);
  const radiusKm = Number(radius) || 10;
  const radiusMeters = radiusKm * 1000;

  try {
    const response = await axios.post(
      'https://places.googleapis.com/v1/places:searchNearby',
      {
        includedTypes: ['hospital'],
        maxResultCount: 20,
        locationRestriction: {
          circle: {
            center: { latitude: userLat, longitude: userLng },
            radius: Math.min(radiusMeters, 50000.0),
          },
        },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.types,places.nationalPhoneNumber,places.rating,places.regularOpeningHours',
        },
        timeout: 8000,
      }
    );

    const places = response.data.places || [];
    const hospitals = places.map((p) => {
      const hLat = p.location?.latitude;
      const hLng = p.location?.longitude;
      const distKm = (hLat !== undefined && hLng !== undefined)
        ? calculateDistanceKm(userLat, userLng, hLat, hLng)
        : 0;

      return {
        id: p.id,
        placeId: p.id,
        name: p.displayName?.text || 'Hospital',
        address: p.formattedAddress || '',
        latitude: hLat,
        longitude: hLng,
        distanceKm: distKm,
        formattedDistance: formatDistance(distKm),
        phone: p.nationalPhoneNumber || null,
        rating: p.rating || null,
        isOpenNow: p.regularOpeningHours?.openNow ?? null,
      };
    });

    hospitals.sort((a, b) => a.distanceKm - b.distanceKm);

    return sendSuccess(res, {
      statusCode: 200,
      message: `Found ${hospitals.length} nearby hospital(s) via Google Places`,
      data: { hospitals, attribution: 'Powered by Google' },
    });
  } catch (googleError) {
    const errMsg = googleError.response?.data?.error?.message || googleError.message;
    logger.error(`Google Places Nearby Search error: ${errMsg}`);
    return sendError(res, {
      statusCode: 502,
      message: 'Failed to retrieve nearby hospitals from Google Places API',
      error: errMsg,
    });
  }
});

// GET /api/v1/hospitals/:placeId — Get details for a single placeId
const getHospitalByPlaceId = asyncHandler(async (req, res) => {
  const { placeId } = req.params;

  if (!placeId) {
    return sendError(res, {
      statusCode: 400,
      message: 'Place ID is required',
    });
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    return sendError(res, {
      statusCode: 503,
      message: 'Google Places API key is not configured on server (GOOGLE_MAPS_API_KEY missing)',
    });
  }

  try {
    const response = await axios.get(
      `https://places.googleapis.com/v1/places/${placeId}`,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,nationalPhoneNumber,rating,regularOpeningHours',
        },
        timeout: 8000,
      }
    );

    const p = response.data;
    return sendSuccess(res, {
      statusCode: 200,
      message: 'Place details retrieved from Google Places',
      data: {
        hospital: {
          id: p.id,
          placeId: p.id,
          name: p.displayName?.text || 'Hospital',
          address: p.formattedAddress || '',
          latitude: p.location?.latitude || null,
          longitude: p.location?.longitude || null,
          phone: p.nationalPhoneNumber || null,
          rating: p.rating || null,
          isOpenNow: p.regularOpeningHours?.openNow ?? null,
        },
        attribution: 'Powered by Google',
      },
    });
  } catch (googleError) {
    const errMsg = googleError.response?.data?.error?.message || googleError.message;
    logger.error(`Google Place Details error: ${errMsg}`);
    return sendError(res, {
      statusCode: 502,
      message: 'Failed to retrieve place details from Google Places API',
      error: errMsg,
    });
  }
});

module.exports = {
  autocompleteHospitals,
  getNearbyHospitals,
  getHospitalByPlaceId,
};
