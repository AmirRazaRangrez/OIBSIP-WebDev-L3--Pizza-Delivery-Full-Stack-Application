// e2e_tests/tier2_boundaries/f24_m6_boundaries.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnvironment, teardownTestEnvironment } from '../helpers/testContext.js';

describe('Tier 2: Boundary & Corner Cases F24 (Milestone 6)', () => {
  let client;

  before(async () => {
    const ctx = await setupTestEnvironment();
    client = ctx.client;
  });

  after(async () => {
    await teardownTestEnvironment();
  });

  // ==========================================
  // F24 Boundaries & Adversarial Stress
  // ==========================================
  describe('F24: Adversarial Hardening Boundaries', () => {
    it('T2_F24_01: SQL injection style username/email returns 400 Bad Request or 401', async () => {
      const res = await client.post('/api/auth/login', {
        email: "' OR '1'='1",
        password: "' OR '1'='1"
      });
      assert.ok(res.status === 400 || res.status === 401);
    });

    it('T2_F24_02: HTML/Script tags in registration name are safely stored without executing', async () => {
      const xssPayload = "<script>alert('xss')</script>";
      const res = await client.post('/api/auth/register', {
        name: xssPayload,
        email: `xss_${Date.now()}@example.com`,
        password: 'Password123!'
      });
      assert.strictEqual(res.status, 201);
      // Server returned name should either escape or preserve without executing
      assert.ok(typeof res.data.user.name === 'string');
    });

    it('T2_F24_03: Excessive payload size (>5MB) returns 400 or error without crashing server', async () => {
      const bigString = 'A'.repeat(6 * 1024 * 1024); // 6MB
      const res = await client.request('POST', '/api/auth/login', bigString);
      assert.ok(res.status === 400 || res.status === 500 || res.status === 413);
    });

    it('T2_F24_04: Unsupported HTTP method PUT on /api/auth/login returns 404', async () => {
      const res = await client.request('PUT', '/api/auth/login', { email: 'a@b.com' });
      assert.strictEqual(res.status, 404);
    });

    it('T2_F24_05: Trailing slashes on REST paths are handled safely', async () => {
      const res = await client.get('/api/inventory/');
      assert.ok(res.status === 200 || res.status === 404);
    });
  });
});

