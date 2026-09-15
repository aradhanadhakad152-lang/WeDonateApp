'use strict';

/**
 * Red Blood Cell (RBC) Compatibility Utility
 *
 * Defines donor-to-recipient blood group compatibility mapping for emergency blood donation.
 *
 * Recipient Group -> Compatible Donor Groups (who can donate to this recipient):
 * - O+  <- O+, O-
 * - O-  <- O-
 * - A+  <- A+, A-, O+, O-
 * - A-  <- A-, O-
 * - B+  <- B+, B-, O+, O-
 * - B-  <- B-, O-
 * - AB+ <- AB+, AB-, A+, A-, B+, B-, O+, O- (Universal Recipient)
 * - AB- <- AB-, A-, B-, O-
 */

const COMPATIBILITY_MAP = {
  'O+': ['O+', 'O-'],
  'O-': ['O-'],
  'A+': ['A+', 'A-', 'O+', 'O-'],
  'A-': ['A-', 'O-'],
  'B+': ['B+', 'B-', 'O+', 'O-'],
  'B-': ['B-', 'O-'],
  'AB+': ['AB+', 'AB-', 'A+', 'A-', 'B+', 'B-', 'O+', 'O-'],
  'AB-': ['AB-', 'A-', 'B-', 'O-'],
};

/**
 * Returns an array of blood groups compatible to donate to a given recipient.
 * @param {string} recipientGroup - Blood group of the patient in need
 * @returns {string[]} Array of compatible donor blood groups
 */
const getCompatibleDonorGroups = (recipientGroup) => {
  if (!recipientGroup || typeof recipientGroup !== 'string') {
    throw new Error('Recipient blood group must be a valid string');
  }

  const normalized = recipientGroup.trim().toUpperCase();
  const compatible = COMPATIBILITY_MAP[normalized];

  if (!compatible) {
    throw new Error(`Unsupported blood group: ${recipientGroup}`);
  }

  return compatible;
};

/**
 * Returns an array of recipient blood groups that a given donor blood group can donate to.
 * @param {string} donorGroup - Blood group of the donor
 * @returns {string[]} Array of recipient blood groups compatible with this donor
 */
const getCompatibleRecipientGroups = (donorGroup) => {
  if (!donorGroup || typeof donorGroup !== 'string') {
    throw new Error('Donor blood group must be a valid string');
  }

  const normalized = donorGroup.trim().toUpperCase();
  const recipientGroups = [];

  for (const [recipient, compatibleDonors] of Object.entries(COMPATIBILITY_MAP)) {
    if (compatibleDonors.includes(normalized)) {
      recipientGroups.push(recipient);
    }
  }

  if (recipientGroups.length === 0) {
    throw new Error(`Unsupported blood group: ${donorGroup}`);
  }

  return recipientGroups;
};

/**
 * Checks if a donor blood group is compatible for a recipient blood group.
 * @param {string} donorGroup
 * @param {string} recipientGroup
 * @returns {boolean}
 */
const isBloodCompatible = (donorGroup, recipientGroup) => {
  try {
    const compatibleGroups = getCompatibleDonorGroups(recipientGroup);
    return compatibleGroups.includes(donorGroup.trim().toUpperCase());
  } catch (err) {
    return false;
  }
};

module.exports = {
  COMPATIBILITY_MAP,
  getCompatibleDonorGroups,
  getCompatibleRecipientGroups,
  isBloodCompatible,
};
