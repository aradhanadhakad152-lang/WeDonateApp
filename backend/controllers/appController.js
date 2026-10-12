'use strict';

const { sendSuccess } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { getAppVersionConfig } = require('../config/appVersion');

/**
 * GET /api/v1/app/version
 * Returns public App Version & Update Information
 */
const getAppVersion = asyncHandler(async (req, res) => {
  const versionData = getAppVersionConfig();

  return sendSuccess(res, {
    statusCode: 200,
    message: 'App version retrieved successfully',
    data: versionData,
  });
});

module.exports = {
  getAppVersion,
};
