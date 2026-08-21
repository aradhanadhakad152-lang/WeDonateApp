'use strict';

const DONATION_INTERVAL_DAYS = 90;

/**
 * Eligibility Service
 *
 * Calculates donor eligibility based on:
 * - Last donation date (minimum 90 days interval)
 * - Donor age (between 18 and 65)
 * - Account active status
 */

/**
 * Calculates the next eligible donation date from the last donation date.
 * @param {Date|string} lastDonationDate
 * @returns {Date|null}
 */
const calculateNextEligibleDate = (lastDonationDate) => {
  if (!lastDonationDate) return null;
  const nextDate = new Date(lastDonationDate);
  nextDate.setDate(nextDate.getDate() + DONATION_INTERVAL_DAYS);
  return nextDate;
};

/**
 * Determines if a donor is currently eligible to donate blood.
 * @param {object} user - User model or plain object
 * @returns {{ isEligible: boolean, nextEligibleDate: Date|null, reason: string|null }}
 */
const checkEligibility = (user) => {
  if (!user) {
    return { isEligible: false, nextEligibleDate: null, reason: 'User not found' };
  }

  if (user.isActive === false || user.accountStatus === 'SUSPENDED') {
    return { isEligible: false, nextEligibleDate: null, reason: 'Account is not active' };
  }

  if (user.age && (user.age < 18 || user.age > 65)) {
    return { isEligible: false, nextEligibleDate: null, reason: 'Age must be between 18 and 65' };
  }

  if (user.lastDonationDate) {
    const nextEligibleDate = calculateNextEligibleDate(user.lastDonationDate);
    const now = new Date();
    if (now < nextEligibleDate) {
      return {
        isEligible: false,
        nextEligibleDate,
        reason: `Must wait ${DONATION_INTERVAL_DAYS} days between donations. Next eligible date: ${nextEligibleDate.toISOString().split('T')[0]}`,
      };
    }
  }

  return { isEligible: true, nextEligibleDate: null, reason: null };
};

module.exports = {
  DONATION_INTERVAL_DAYS,
  calculateNextEligibleDate,
  checkEligibility,
};
