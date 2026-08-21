'use strict';

/**
 * Geographic Distance Calculation Utility using the Haversine Formula.
 *
 * Calculates the great-circle distance between two points on the Earth's surface
 * given their latitudes and longitudes.
 */

// Earth's mean radius in kilometers
const EARTH_RADIUS_KM = 6371;

/**
 * Converts degrees to radians.
 * @param {number} degrees
 * @returns {number} radians
 */
const toRadians = (degrees) => {
  return (degrees * Math.PI) / 180;
};

/**
 * Calculates distance between two points in kilometers using the Haversine formula.
 *
 * @param {number} lat1 - Latitude of Point A (-90 to 90)
 * @param {number} lon1 - Longitude of Point A (-180 to 180)
 * @param {number} lat2 - Latitude of Point B (-90 to 90)
 * @param {number} lon2 - Longitude of Point B (-180 to 180)
 * @returns {number} Distance in kilometers rounded to 2 decimal places
 */
const calculateDistanceKm = (lat1, lon1, lat2, lon2) => {
  const nLat1 = Number(lat1);
  const nLon1 = Number(lon1);
  const nLat2 = Number(lat2);
  const nLon2 = Number(lon2);

  if (
    isNaN(nLat1) || isNaN(nLon1) || isNaN(nLat2) || isNaN(nLon2) ||
    nLat1 < -90 || nLat1 > 90 || nLat2 < -90 || nLat2 > 90 ||
    nLon1 < -180 || nLon1 > 180 || nLon2 < -180 || nLon2 > 180
  ) {
    throw new Error('Invalid latitude or longitude coordinates provided to calculateDistanceKm');
  }

  // Exact same point
  if (nLat1 === nLat2 && nLon1 === nLon2) {
    return 0;
  }

  const dLat = toRadians(nLat2 - nLat1);
  const dLon = toRadians(nLon2 - nLon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(nLat1)) *
      Math.cos(toRadians(nLat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = EARTH_RADIUS_KM * c;

  return Math.round(distance * 100) / 100;
};

/**
 * Calculates distance between two points in meters.
 * @returns {number} Distance in meters
 */
const calculateDistanceMeters = (lat1, lon1, lat2, lon2) => {
  return Math.round(calculateDistanceKm(lat1, lon1, lat2, lon2) * 1000);
};

/**
 * Formats a distance value for human-readable UI display.
 * @param {number} km - Distance in kilometers
 * @returns {string} Formatted string (e.g., "450 m", "2.3 km")
 */
const formatDistance = (km) => {
  if (km === null || km === undefined || isNaN(km)) return 'Unknown distance';
  if (km < 1) {
    const meters = Math.round(km * 1000);
    return `${meters} m`;
  }
  return `${km.toFixed(1)} km`;
};

module.exports = {
  EARTH_RADIUS_KM,
  calculateDistanceKm,
  calculateDistanceMeters,
  formatDistance,
};
