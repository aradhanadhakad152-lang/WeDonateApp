'use strict';

const { sendError } = require('../utils/apiResponse');

/**
 * Role-Based Access Control (RBAC) Middleware — Production Grade
 *
 * Verifies that the authenticated JWT user possesses one of the allowed system roles.
 *
 * Supported Roles:
 * - SUPER_ADMIN: Full system control
 * - ADMIN: Operational management & fallback request verification
 * - HOSPITAL_MANAGER: Hospital data & verification queue
 * - BLOOD_BANK_MANAGER: Blood bank data & inventory
 * - CAMP_ORGANIZER: Donation drives
 * - SUPPORT_STAFF: Limited operational access
 * - CITIZEN: Default donor/patient account
 *
 * Usage: authorizeRoles('SUPER_ADMIN', 'ADMIN', 'HOSPITAL_MANAGER')
 */
const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return sendError(res, {
        statusCode: 401,
        message: 'Authentication required before role authorization',
      });
    }

    const userRole = req.user.role;

    if (!userRole || (!allowedRoles.includes(userRole) && userRole !== 'SUPER_ADMIN')) {
      return sendError(res, {
        statusCode: 403,
        message: `Access denied. Role '${userRole || 'UNKNOWN'}' is not authorized to access this resource`,
      });
    }

    next();
  };
};

/**
 * Restricts organization portal endpoints so staff members can only access their linked organization.
 */
const authorizeOrganizationAccess = (req, res, next) => {
  if (!req.user) {
    return sendError(res, {
      statusCode: 401,
      message: 'Authentication required',
    });
  }

  // Super admins and admins bypass organization scope restrictions
  if (['SUPER_ADMIN', 'ADMIN'].includes(req.user.role)) {
    return next();
  }

  const userOrgId = req.user.organizationId;
  const targetOrgId = req.params.organizationId || req.body.organizationId || req.query.organizationId;

  if (!userOrgId) {
    return sendError(res, {
      statusCode: 403,
      message: 'Access denied. Account is not linked to any registered Organization',
    });
  }

  if (targetOrgId && userOrgId.toString() !== targetOrgId.toString()) {
    return sendError(res, {
      statusCode: 403,
      message: 'Access denied. You can only manage data for your own organization',
    });
  }

  next();
};

module.exports = {
  authorizeRoles,
  authorizeOrganizationAccess,
};
