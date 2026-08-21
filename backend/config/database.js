'use strict';

const mongoose = require('mongoose');
const logger = require('../utils/logger');

/**
 * Helper to clean up and sanitize MongoDB URIs.
 * Handles:
 * - Duplicate MONGODB_URI= prefix
 * - Surrounding quotes
 * - Unencoded special characters in passwords (e.g. '@')
 */
const sanitizeMongoURI = (rawUri) => {
  if (!rawUri) return rawUri;
  let uri = rawUri.trim().replace(/^MONGODB_URI=\s*/i, '').replace(/^["']|["']$/g, '');

  if (uri.startsWith('mongodb://') || uri.startsWith('mongodb+srv://')) {
    const schemeEnd = uri.indexOf('://') + 3;
    const scheme = uri.substring(0, schemeEnd);
    const rest = uri.substring(schemeEnd);
    const lastAtIndex = rest.lastIndexOf('@');

    if (lastAtIndex !== -1) {
      const userInfo = rest.substring(0, lastAtIndex);
      const hostAndPath = rest.substring(lastAtIndex + 1);
      const colonIndex = userInfo.indexOf(':');

      if (colonIndex !== -1) {
        const username = userInfo.substring(0, colonIndex);
        const rawPassword = userInfo.substring(colonIndex + 1);
        const encodedPassword = encodeURIComponent(decodeURIComponent(rawPassword));
        uri = `${scheme}${username}:${encodedPassword}@${hostAndPath}`;
      }
    }
  }
  return uri;
};

/**
 * Connects to MongoDB Atlas using the URI from environment variables.
 * Implements retry logic and connection event listeners.
 */
const connectDB = async () => {
  const rawUri = process.env.MONGODB_URI;

  if (!rawUri) {
    logger.error('MONGODB_URI is not defined in environment variables');
    process.exit(1);
  }

  const uri = sanitizeMongoURI(rawUri);

  const options = {
    serverSelectionTimeoutMS: 5000, // Fail fast if Atlas is unreachable or IP restricted
    socketTimeoutMS: 45000,
    maxPoolSize: 10,
  };

  try {
    const conn = await mongoose.connect(uri, options);
    logger.info(`MongoDB Atlas connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    logger.error(`MongoDB connection failed: ${error.message}`);
    throw error;
  }
};

// Connection event listeners
mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected — attempting reconnect...');
});

mongoose.connection.on('reconnected', () => {
  logger.info('MongoDB reconnected');
});

mongoose.connection.on('error', (err) => {
  logger.error(`MongoDB connection error: ${err.message}`);
});

module.exports = connectDB;
module.exports.sanitizeMongoURI = sanitizeMongoURI;
