// e2e_tests/tier1_features/f01_f06_m1.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnvironment, teardownTestEnvironment } from '../helpers/testContext.js';
import { generateRandomEmail, generateRandomPassword, decodeJwt } from '../helpers/cryptoHelper.js';
import { config } from '../config.js';

describe('Tier 1: Features F01–F06 (Milestone 1)', () => {
  let client;

  before(async () => {
    const ctx = await setupTestEnvironment();
    client = ctx.client;
  });

  after(async () => {
    await teardownTestEnvironment();
  });

  // ==========================================
  // F01: User Registration & Email Verification
  // ==========================================
  describe('F01: User Registration & Email Verification', () => {
    const testEmail = generateRandomEmail('reg');
    const testPassword = 'Password123!';
    let verificationToken = '';

    it('T1_F01_01: User registration succeeds and returns 201 with verification token', async () => {
      const res = await client.post('/api/auth/register', {
        name: 'John Doe',
        email: testEmail,
        password: testPassword
      });
      assert.strictEqual(res.status, 201, `Expected 201, got ${res.status}: ${JSON.stringify(res.data)}`);
      assert.ok(res.data.emailVerificationToken, 'Should return verification token');
      verificationToken = res.data.emailVerificationToken;
    });

    it('T1_F01_02: Registered user password is secure and not exposed in plain text', async () => {
      const res = await client.post('/api/auth/register', {
        name: 'Plain Test',
        email: generateRandomEmail('plain'),
        password: 'SecretPassword99!'
      });
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.data.password, undefined);
      assert.strictEqual(res.data.passwordHash, undefined);
    });

    it('T1_F01_03: Verification token query verifies email and returns 200', async () => {
      const res = await client.get(`/api/auth/verify-email?token=${verificationToken}`);
      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
      assert.match(res.data.message, /verified/i);
    });

    it('T1_F01_04: Verified user can now authenticate successfully', async () => {
      const res = await client.post('/api/auth/login', {
        email: testEmail,
        password: testPassword
      });
      assert.strictEqual(res.status, 200);
      assert.ok(res.data.token, 'Should receive auth token');
    });

    it('T1_F01_05: Registering second unique user generates distinct verification token', async () => {
      const res = await client.post('/api/auth/register', {
        name: 'Second User',
        email: generateRandomEmail('second'),
        password: testPassword
      });
      assert.strictEqual(res.status, 201);
      assert.notStrictEqual(res.data.emailVerificationToken, verificationToken);
    });
  });

  // ==========================================
  // F02: User Login & JWT Auth
  // ==========================================
  describe('F02: User Login & JWT Auth', () => {
    const userEmail = generateRandomEmail('login');
    const userPassword = 'UserPass123!';
    let userToken = '';

    before(async () => {
      const regRes = await client.post('/api/auth/register', {
        name: 'Login Tester',
        email: userEmail,
        password: userPassword
      });
      await client.get(`/api/auth/verify-email?token=${regRes.data.emailVerificationToken}`);
    });

    it('T1_F02_01: Verified user logs in with valid credentials and receives JWT', async () => {
      const res = await client.post('/api/auth/login', {
        email: userEmail,
        password: userPassword
      });
      assert.strictEqual(res.status, 200);
      assert.ok(res.data.token);
      userToken = res.data.token;
    });

    it('T1_F02_02: JWT token payload includes user ID, email, and role: user', () => {
      const decoded = decodeJwt(userToken);
      assert.ok(decoded);
      assert.strictEqual(decoded.email, userEmail.toLowerCase());
      assert.strictEqual(decoded.role, 'user');
    });

    it('T1_F02_03: Accessing authenticated endpoint with Bearer token succeeds', async () => {
      client.setToken(userToken);
      const res = await client.get('/api/orders');
      assert.strictEqual(res.status, 200);
      client.clearToken();
    });

    it('T1_F02_04: Login response returns user object with name and email', async () => {
      const res = await client.post('/api/auth/login', {
        email: userEmail,
        password: userPassword
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.user.name, 'Login Tester');
      assert.strictEqual(res.data.user.email, userEmail.toLowerCase());
    });

    it('T1_F02_05: Clearing Bearer token reverts client to unauthenticated state', async () => {
      client.clearToken();
      const res = await client.get('/api/orders');
      assert.strictEqual(res.status, 401);
    });
  });

  // ==========================================
  // F03: Forgot Password & Reset Link
  // ==========================================
  describe('F03: Forgot Password & Reset Link', () => {
    const forgotEmail = generateRandomEmail('forgot');
    let originalPass = 'OldSecret123!';
    let newPass = 'NewSecret456!';
    let resetToken = '';

    before(async () => {
      const reg = await client.post('/api/auth/register', {
        name: 'Forgot Tester',
        email: forgotEmail,
        password: originalPass
      });
      await client.get(`/api/auth/verify-email?token=${reg.data.emailVerificationToken}`);
    });

    it('T1_F03_01: Forgot password endpoint accepts email and dispatches reset token', async () => {
      const res = await client.post('/api/auth/forgot-password', { email: forgotEmail });
      assert.strictEqual(res.status, 200);
      assert.ok(res.data.resetToken);
      resetToken = res.data.resetToken;
    });

    it('T1_F03_02: Reset token is a non-empty cryptographic string', () => {
      assert.ok(typeof resetToken === 'string');
      assert.ok(resetToken.length >= 16);
    });

    it('T1_F03_03: Reset password endpoint accepts token and new password', async () => {
      const res = await client.post('/api/auth/reset-password', {
        token: resetToken,
        newPassword: newPass
      });
      assert.strictEqual(res.status, 200);
      assert.match(res.data.message, /updated/i);
    });

    it('T1_F03_04: User can immediately authenticate with the new password', async () => {
      const res = await client.post('/api/auth/login', {
        email: forgotEmail,
        password: newPass
      });
      assert.strictEqual(res.status, 200);
      assert.ok(res.data.token);
    });

    it('T1_F03_05: Old password no longer authenticates', async () => {
      const res = await client.post('/api/auth/login', {
        email: forgotEmail,
        password: originalPass
      });
      assert.strictEqual(res.status, 401);
    });
  });

  // ==========================================
  // F04: Admin Role Isolation
  // ==========================================
  describe('F04: Admin Role Isolation', () => {
    let adminToken = '';

    it('T1_F04_01: Dedicated admin login accepts seeded admin credentials', async () => {
      const res = await client.post('/api/admin/auth/login', {
        email: config.adminCredentials.email,
        password: config.adminCredentials.password
      });
      assert.strictEqual(res.status, 200);
      assert.ok(res.data.token);
      assert.strictEqual(res.data.admin.role, 'admin');
      adminToken = res.data.token;
    });

    it('T1_F04_02: Admin JWT payload strictly contains role: admin', () => {
      const decoded = decodeJwt(adminToken);
      assert.strictEqual(decoded.role, 'admin');
    });

    it('T1_F04_03: Public registration payload cannot elevate role to admin', async () => {
      const hackerEmail = generateRandomEmail('hacker');
      const res = await client.post('/api/auth/register', {
        name: 'Hacker User',
        email: hackerEmail,
        password: 'Password123!',
        role: 'admin'
      });
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.data.user.role, 'user');
    });

    it('T1_F04_04: Consumer user token is blocked from admin routes with 403', async () => {
      const reg = await client.post('/api/auth/register', {
        name: 'Normal User',
        email: generateRandomEmail('normal'),
        password: 'Password123!'
      });
      await client.get(`/api/auth/verify-email?token=${reg.data.emailVerificationToken}`);
      const login = await client.post('/api/auth/login', {
        email: reg.data.user.email,
        password: 'Password123!'
      });
      client.setToken(login.data.token);

      const res = await client.get('/api/admin/orders');
      assert.strictEqual(res.status, 403);
      client.clearToken();
    });

    it('T1_F04_05: Admin token successfully accesses admin endpoints', async () => {
      client.setToken(adminToken);
      const res = await client.get('/api/admin/orders');
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.data));
      client.clearToken();
    });
  });

  // ==========================================
  // F05: Inventory Data Models & Seeding
  // ==========================================
  describe('F05: Inventory Data Models & Seeding', () => {
    it('T1_F05_01: GET /api/inventory returns array of inventory items', async () => {
      const res = await client.get('/api/inventory');
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.data));
      assert.ok(res.data.length >= 19, 'Should have bases, sauces, cheeses, veggies');
    });

    it('T1_F05_02: GET /api/inventory/grouped returns 4 distinct categories', async () => {
      const res = await client.get('/api/inventory/grouped');
      assert.strictEqual(res.status, 200);
      assert.ok(res.data.bases);
      assert.ok(res.data.sauces);
      assert.ok(res.data.cheeses);
      assert.ok(res.data.veggies);
    });

    it('T1_F05_03: Base category contains at least 5 required base varieties', async () => {
      const res = await client.get('/api/inventory/grouped');
      assert.strictEqual(res.status, 200);
      assert.ok(res.data.bases.length >= 5);
      const baseNames = res.data.bases.map(b => b.name);
      assert.ok(baseNames.includes('Thin Crust'));
      assert.ok(baseNames.includes('Cheese Burst'));
      assert.ok(baseNames.includes('Pan Pizza'));
    });

    it('T1_F05_04: Sauce category contains at least 5 required sauce varieties', async () => {
      const res = await client.get('/api/inventory/grouped');
      assert.strictEqual(res.status, 200);
      assert.ok(res.data.sauces.length >= 5);
      const sauceNames = res.data.sauces.map(s => s.name);
      assert.ok(sauceNames.includes('Classic Tomato'));
      assert.ok(sauceNames.includes('Spicy Marinara'));
      assert.ok(sauceNames.includes('Smoky BBQ'));
    });

    it('T1_F05_05: Every seeded inventory item has initial stock > 0 and price > 0', async () => {
      const res = await client.get('/api/inventory');
      for (const item of res.data) {
        assert.ok(item.stock > 0, `Item ${item.name} has invalid stock: ${item.stock}`);
        assert.ok(item.price > 0, `Item ${item.name} has invalid price: ${item.price}`);
      }
    });
  });

  // ==========================================
  // F06: Admin Inventory Management API
  // ==========================================
  describe('F06: Admin Inventory Management API', () => {
    let adminToken = '';
    let targetItemId = '';

    before(async () => {
      const res = await client.post('/api/admin/auth/login', {
        email: config.adminCredentials.email,
        password: config.adminCredentials.password
      });
      adminToken = res.data.token;

      const invRes = await client.get('/api/inventory');
      targetItemId = invRes.data[0]._id;
    });

    it('T1_F06_01: Admin can query inventory item list', async () => {
      client.setToken(adminToken);
      const res = await client.get('/api/inventory');
      assert.strictEqual(res.status, 200);
      assert.ok(res.data.length > 0);
      client.clearToken();
    });

    it('T1_F06_02: Admin can update stock level via PUT /api/inventory/:id/stock', async () => {
      client.setToken(adminToken);
      const res = await client.put(`/api/inventory/${targetItemId}/stock`, {
        stock: 99
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.item.stock, 99);
      client.clearToken();
    });

    it('T1_F06_03: Admin can update alert threshold for an inventory item', async () => {
      client.setToken(adminToken);
      const res = await client.put(`/api/inventory/${targetItemId}/stock`, {
        threshold: 25
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.item.threshold, 25);
      client.clearToken();
    });

    it('T1_F06_04: Updated stock persists and reflects in subsequent GET requests', async () => {
      const res = await client.get('/api/inventory');
      const item = res.data.find(i => i._id === targetItemId);
      assert.strictEqual(item.stock, 99);
      assert.strictEqual(item.threshold, 25);
    });

    it('T1_F06_05: Updating stock resets item back to healthy operational level', async () => {
      client.setToken(adminToken);
      const res = await client.put(`/api/inventory/${targetItemId}/stock`, {
        stock: 50,
        threshold: 20
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.item.stock, 50);
      client.clearToken();
    });
  });
});

