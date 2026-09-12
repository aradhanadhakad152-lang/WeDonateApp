'use strict';

const logger = require('../utils/logger');

/**
 * IdentityVerificationService — Identity Verification Abstraction Layer
 *
 * Provides a clean interface for identity verification.
 * CURRENT IMPLEMENTATION: Uses existing Phone / JWT authentication.
 * FUTURE EXTENSION: Prepared hook for optional Ayushman Bharat Digital Mission (ABHA) Health ID integration.
 *
 * NOTE: DO NOT collect or store ABHA identifiers now. This class provides the clean architectural hook.
 */
class IdentityVerificationService {
  /**
   * Verifies identity using current system authentication.
   * @param {Object} user - User document
   * @returns {Promise<Object>} Verification status object
   */
  static async verifyIdentity(user) {
    if (!user) {
      throw new Error('User document required for identity verification');
    }

    return {
      provider: 'WE_DONATE_AUTH',
      isVerified: !!user.isVerified,
      phoneVerified: true,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Future ABHA Health ID verification stub.
   * Currently disabled.
   */
  static async verifyAbhaHealthId(abhaId) {
    logger.info(`ABHA verification requested for stub ID: ${abhaId} (Feature disabled per policy)`);
    return {
      provider: 'ABHA_HEALTH_ID',
      isVerified: false,
      status: 'NOT_IMPLEMENTED',
      message: 'ABHA Integration Layer is currently disabled. Using standard system authentication.',
    };
  }
}

module.exports = IdentityVerificationService;
