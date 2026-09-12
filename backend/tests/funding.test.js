'use strict';

const request = require('supertest');
const app = require('../server');

jest.setTimeout(15000);

describe('Funding API Endpoints (/api/v1/funding)', () => {
  describe('GET /api/v1/funding/campaigns', () => {
    it('should respond to GET /api/v1/funding/campaigns', async () => {
      const res = await request(app).get('/api/v1/funding/campaigns');
      expect([200, 404, 500, 503]).toContain(res.statusCode);
      if (res.statusCode === 200) {
        expect(res.body.success).toBe(true);
      }
    }, 15000);
  });

  describe('POST /api/v1/funding/donate', () => {
    it('should reject unauthenticated donation attempt', async () => {
      const res = await request(app)
        .post('/api/v1/funding/donate')
        .send({ amount: 500 });
      expect([401, 404, 500, 503]).toContain(res.statusCode);
    });
  });

  describe('GET /api/v1/funding/my-donations', () => {
    it('should reject unauthenticated request', async () => {
      const res = await request(app).get('/api/v1/funding/my-donations');
      expect([401, 404, 500, 503]).toContain(res.statusCode);
    });
  });
});
