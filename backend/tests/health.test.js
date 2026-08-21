'use strict';

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../server');
const { sanitizeMongoURI } = require('../config/database');

describe('GET /api/health', () => {
  beforeAll(async () => {
    if (process.env.MONGODB_URI && mongoose.connection.readyState === 0) {
      const uri = sanitizeMongoURI(process.env.MONGODB_URI);
      try {
        await mongoose.connect(uri, { serverSelectionTimeoutMS: 2000 });
      } catch (err) {
        // Log connection error cleanly without crashing hook
      }
    }
  }, 10000);

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
  });

  it('should respond to GET /api/health with status info', async () => {
    const res = await request(app).get('/api/health');
    expect([200, 503]).toContain(res.statusCode);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('timestamp');
  });
});
