// e2e_tests/tier2_boundaries/f01_f06_m1_boundaries.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnvironment, teardownTestEnvironment } from '../helpers/testContext.js';
import { generateRandomEmail, createTestJwt } from '../helpers/cryptoHelper.js';
import { config } from '../config.js';

describe('Tier 2: Boundary & Corner Cases F01–F06 (Milestone 1)', () => {
  let client;
  let adminToken;
  let validUserToken;

  before(async () => {
    const ctx = await setupTestEnvironment();
    client = ctx.client;

    const adminLogin = await client.post('/api/admin/auth/login', {
      email: config.adminCredentials.email,
      password: config.adminCredentials.password
    });
    adminToken = adminLogin.data.token;

    const email = generateRandomEmail('b_user');
    const reg = await client.post('/api/auth/register', {
      name: 'Boundary User',
      email,
      password: 'Password123!'
    });
    await client.get(`/api/auth/verify-email?token=${reg.data.emailVerificationToken}`);
    const login = await client.post('/api/auth/login', { email, password: 'Password123!' });
    validUserToken = login.data.token;
  });

  after(async () => {
    await teardownTestEnvironment();
  });

  // ==========================================
  // F01 Boundaries
  // ==========================================
  describe('F01: User Registration Boundaries', () => {
    it('T2_F01_01: Register with missing email returns 400 Bad Request', async () => {
      const res = await client.post('/api/auth/register', {
        name: 'No Email',
        password: 'Password123!'
      });
      assert.strictEqual(res.status, 400);
      assert.match(res.data.error, /required/i);
    });

    it('T2_F01_02: Register with invalid email format returns 400 Bad Request', async () => {
      const res = await client.post('/api/auth/register', {
        name: 'Invalid Email',
        email: 'notanemailaddress',
        password: 'Password123!'
      });
      assert.strictEqual(res.status, 400);
      assert.match(res.data.error, /email format/i);
    });

    it('T2_F01_03: Register with duplicate email returns 409 Conflict', async () => {
      const email = generateRandomEmail('dup');
      await client.post('/api/auth/register', {
        name: 'First User',
        email,
        password: 'Password123!'
      });
      const res = await client.post('/api/auth/register', {
        name: 'Duplicate User',
        email,
        password: 'Password123!'
      });
      assert.strictEqual(res.status, 409);
      assert.match(res.data.error, /already registered/i);
    });

    it('T2_F01_04: Register with short password (< 6 chars) returns 400 Bad Request', async () => {
      const res = await client.post('/api/auth/register', {
        name: 'Short Pass',
        email: generateRandomEmail('short'),
        password: '123'
      });
      assert.strictEqual(res.status, 400);
      assert.match(res.data.error, /at least 6 characters/i);
    });

    it('T2_F01_05: Verify email with non-existent or malformed token returns 400', async () => {
      const res = await client.get('/api/auth/verify-email?token=invalid_fake_token_123');
      assert.strictEqual(res.status, 400);
    });
  });

  // ==========================================
  // F02 Boundaries
  // ==========================================
  describe('F02: User Login Boundaries', () => {
    it('T2_F02_01: Login with unverified email account returns 403 Forbidden', async () => {
      const email = generateRandomEmail('unver');
      await client.post('/api/auth/register', {
        name: 'Unverified User',
        email,
        password: 'Password123!'
      });
      const res = await client.post('/api/auth/login', {
        email,
        password: 'Password123!'
      });
      assert.strictEqual(res.status, 403);
      assert.match(res.data.error, /verify/i);
    });

    it('T2_F02_02: Login with incorrect password returns 401 Unauthorized', async () => {
      const res = await client.post('/api/auth/login', {
        email: config.adminCredentials.email,
        password: 'CompletelyWrongPassword!'
      });
      assert.strictEqual(res.status, 401);
    });

    it('T2_F02_03: Login with non-existent email returns 401 Unauthorized', async () => {
      const res = await client.post('/api/auth/login', {
        email: 'ghost_user_does_not_exist@example.com',
        password: 'Password123!'
      });
      assert.strictEqual(res.status, 401);
    });

    it('T2_F02_04: Accessing protected endpoint without Authorization header returns 401', async () => {
      client.clearToken();
      const res = await client.get('/api/orders');
      assert.strictEqual(res.status, 401);
    });

    it('T2_F02_05: Accessing protected endpoint with malformed Bearer token returns 401', async () => {
      client.setToken('malformed.junk.token');
      const res = await client.get('/api/orders');
      assert.strictEqual(res.status, 401);
      client.clearToken();
    });
  });

  // ==========================================
  // F03 Boundaries
  // ==========================================
  describe('F03: Forgot Password Boundaries', () => {
    it('T2_F03_01: Forgot password with non-existent email returns generic 200 (prevents enumeration)', async () => {
      const res = await client.post('/api/auth/forgot-password', {
        email: 'nobody_here@example.com'
      });
      assert.strictEqual(res.status, 200);
    });

    it('T2_F03_02: Forgot password with empty email returns 400 Bad Request', async () => {
      const res = await client.post('/api/auth/forgot-password', { email: '' });
      assert.strictEqual(res.status, 400);
    });

    it('T2_F03_03: Reset password with non-existent token returns 400 Bad Request', async () => {
      const res = await client.post('/api/auth/reset-password', {
        token: 'fake_reset_token_xyz',
        newPassword: 'BrandNewPassword123!'
      });
      assert.strictEqual(res.status, 400);
    });

    it('T2_F03_04: Reset password with missing newPassword returns 400 Bad Request', async () => {
      const res = await client.post('/api/auth/reset-password', {
        token: 'some_token',
        newPassword: ''
      });
      assert.strictEqual(res.status, 400);
    });

    it('T2_F03_05: Consuming an already-used reset token a second time returns 400', async () => {
      const email = generateRandomEmail('reused_token');
      await client.post('/api/auth/register', {
        name: 'Reused Token User',
        email,
        password: 'Password123!'
      });
      const forgot = await client.post('/api/auth/forgot-password', { email });
      const token = forgot.data.resetToken;

      const firstUse = await client.post('/api/auth/reset-password', {
        token,
        newPassword: 'NewPassword123!'
      });
      assert.strictEqual(firstUse.status, 200);

      const secondUse = await client.post('/api/auth/reset-password', {
        token,
        newPassword: 'AnotherPassword123!'
      });
      assert.strictEqual(secondUse.status, 400);
    });
  });

  // ==========================================
  // F04 Boundaries
  // ==========================================
  describe('F04: Admin Role Isolation Boundaries', () => {
    it('T2_F04_01: Admin login with incorrect admin password returns 401', async () => {
      const res = await client.post('/api/admin/auth/login', {
        email: config.adminCredentials.email,
        password: 'WrongPassword99!'
      });
      assert.strictEqual(res.status, 401);
    });

    it('T2_F04_02: Consumer credentials entered on admin login are rejected with 403', async () => {
      const consumerEmail = generateRandomEmail('cons');
      const reg = await client.post('/api/auth/register', {
        name: 'Consumer Only',
        email: consumerEmail,
        password: 'Password123!'
      });
      await client.get(`/api/auth/verify-email?token=${reg.data.emailVerificationToken}`);

      const res = await client.post('/api/admin/auth/login', {
        email: consumerEmail,
        password: 'Password123!'
      });
      assert.strictEqual(res.status, 403);
    });

    it('T2_F04_03: Registration payload with injected { role: "admin" } does not confer admin access', async () => {
      const email = generateRandomEmail('exploit');
      const reg = await client.post('/api/auth/register', {
        name: 'Exploit Attempt',
        email,
        password: 'Password123!',
        role: 'admin'
      });
      assert.strictEqual(reg.status, 201);
      assert.strictEqual(reg.data.user.role, 'user');
    });

    it('T2_F04_04: JWT forged with fake secret key returns 401 Unauthorized', async () => {
      const forgedToken = createTestJwt(
        { id: 'fake_admin', email: 'forged@admin.com', role: 'admin' },
        'wrong_secret_key_12345'
      );
      client.setToken(forgedToken);
      const res = await client.get('/api/admin/orders');
      assert.strictEqual(res.status, 401);
      client.clearToken();
    });

    it('T2_F04_05: Consumer token attempting to call PUT /api/inventory/:id/stock returns 403', async () => {
      client.setToken(validUserToken);
      const inv = await client.get('/api/inventory');
      const res = await client.put(`/api/inventory/${inv.data[0]._id}/stock`, { stock: 999 });
      assert.strictEqual(res.status, 403);
      client.clearToken();
    });
  });

  // ==========================================
  // F05 Boundaries
  // ==========================================
  describe('F05: Inventory Seeding Boundaries', () => {
    it('T2_F05_01: Requesting non-existent API endpoint /api/inventory/invalid returns 404', async () => {
      const res = await client.get('/api/inventory/invalid_path_404');
      assert.strictEqual(res.status, 404);
    });

    it('T2_F05_02: Inventory collection has strictly unique item IDs', async () => {
      const res = await client.get('/api/inventory');
      const ids = res.data.map(i => i._id);
      const uniqueIds = new Set(ids);
      assert.strictEqual(uniqueIds.size, ids.length);
    });

    it('T2_F05_03: Grouped inventory bases array has no items belonging to sauce or veggie', async () => {
      const res = await client.get('/api/inventory/grouped');
      assert.ok(res.data.bases.every(b => b.category === 'base'));
    });

    it('T2_F05_04: Grouped inventory sauces array has no items belonging to base or cheese', async () => {
      const res = await client.get('/api/inventory/grouped');
      assert.ok(res.data.sauces.every(s => s.category === 'sauce'));
    });

    it('T2_F05_05: Inventory item prices are positive integers', async () => {
      const res = await client.get('/api/inventory');
      assert.ok(res.data.every(i => Number.isInteger(i.price) && i.price > 0));
    });
  });

  // ==========================================
  // F06 Boundaries
  // ==========================================
  describe('F06: Admin Inventory API Boundaries', () => {
    let testItemId;

    before(async () => {
      const inv = await client.get('/api/inventory');
      testItemId = inv.data[0]._id;
    });

    it('T2_F06_01: Updating stock to negative number returns 400 Bad Request', async () => {
      client.setToken(adminToken);
      const res = await client.put(`/api/inventory/${testItemId}/stock`, {
        stock: -10
      });
      assert.strictEqual(res.status, 400);
      client.clearToken();
    });

    it('T2_F06_02: Updating stock with string value returns 400 Bad Request', async () => {
      client.setToken(adminToken);
      const res = await client.put(`/api/inventory/${testItemId}/stock`, {
        stock: 'fifty'
      });
      assert.strictEqual(res.status, 400);
      client.clearToken();
    });

    it('T2_F06_03: Updating threshold to negative number returns 400 Bad Request', async () => {
      client.setToken(adminToken);
      const res = await client.put(`/api/inventory/${testItemId}/stock`, {
        threshold: -5
      });
      assert.strictEqual(res.status, 400);
      client.clearToken();
    });

    it('T2_F06_04: Updating stock on non-existent item ID returns 404 Not Found', async () => {
      client.setToken(adminToken);
      const res = await client.put('/api/inventory/inv_non_existent_999/stock', {
        stock: 50
      });
      assert.strictEqual(res.status, 404);
      client.clearToken();
    });

    it('T2_F06_05: Updating stock without token returns 401 Unauthorized', async () => {
      client.clearToken();
      const res = await client.put(`/api/inventory/${testItemId}/stock`, {
        stock: 50
      });
      assert.strictEqual(res.status, 401);
    });
  });
});

