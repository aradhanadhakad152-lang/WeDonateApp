'use strict';

const { initFirebaseAdmin, verifyFirebaseIdToken } = require('../services/firebaseService');

module.exports = {
  initializeFirebase: initFirebaseAdmin,
  verifyFirebaseToken: verifyFirebaseIdToken,
};
