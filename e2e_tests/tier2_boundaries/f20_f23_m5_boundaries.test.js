// e2e_tests/tier2_boundaries/f20_f23_m5_boundaries.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnvironment, teardownTestEnvironment } from '../helpers/testContext.js';
import { generateRandomEmail, generateRazorpaySignature } from '../helpers/cryptoHelper.js';
import { config } from '../config.js';

describe('Tier 2: Boundary & Corner Cases F20–F23 (Milestone 5)', () => {
  let client;
  let adminToken;
  let userToken;
  let testOrderId;

  before(async () => {
    const ctx = await setupTestEnvironment();
    client = ctx.client;

    const adminLog = await client.post('/api/admin/auth/login', {
      email: config.adminCredentials.email,
      password: config.adminCredentials.password
    });
    adminToken = adminLog.data.token;

    const email = generateRandomEmail('b_m5_user');
    const reg = await client.post('/api/auth/register', {
      name: 'M5 Normal User',
      email,
      password: 'Password123!'
    });
    await client.get(`/api/auth/verify-email?token=${reg.data.emailVerificationToken}`);
    const login = await client.post('/api/auth/login', { email, password: 'Password123!' });
    userToken = login.data.token;

    // Seed an order for testOrderId
    client.setToken(userToken);
    const inv = await client.get('/api/inventory/grouped');
    const ord = await client.post('/api/orders/create-razorpay-order', {
      items: [
        {
          type: 'custom',
          customDetails: { baseId: inv.data.bases[0]._id, sauceId: inv.data.sauces[0]._id, cheeseId: inv.data.cheeses[0]._id },
          quantity: 1
        }
      ],
      deliveryAddress: 'Boundary Order St'
    });
    const payId = 'pay_b_m5_' + Date.now();
    const sig = generateRazorpaySignature(ord.data.razorpayOrderId, payId);
    const ver = await client.post('/api/orders/verify-payment', {
      orderId: ord.data.orderId,
      razorpay_order_id: ord.data.razorpayOrderId,
      razorpay_payment_id: payId,
      razorpay_signature: sig
    });
    testOrderId = ver.data.order._id;
    client.clearToken();
  });

  after(async () => {
    await teardownTestEnvironment();
  });

  // ==========================================
  // F20 Boundaries
  // ==========================================
  describe('F20: Admin Isolated Login Boundaries', () => {
    it('T2_F20_01: Admin login with missing email returns 400 Bad Request', async () => {
      const res = await client.post('/api/admin/auth/login', {
        password: 'AdminPassword123!'
      });
      assert.strictEqual(res.status, 400);
    });

    it('T2_F20_02: Admin login with missing password returns 400 Bad Request', async () => {
      const res = await client.post('/api/admin/auth/login', {
        email: config.adminCredentials.email
      });
      assert.strictEqual(res.status, 400);
    });

    it('T2_F20_03: Admin login with empty object body returns 400 Bad Request', async () => {
      const res = await client.post('/api/admin/auth/login', {});
      assert.strictEqual(res.status, 400);
    });

    it('T2_F20_04: Admin token cannot be acquired through consumer registration endpoint', async () => {
      const email = generateRandomEmail('spoof');
      const reg = await client.post('/api/auth/register', {
        name: 'Spoof Admin',
        email,
        password: 'Password123!',
        role: 'admin',
        isAdmin: true
      });
      assert.strictEqual(reg.status, 201);
      assert.strictEqual(reg.data.user.role, 'user');
    });

    it('T2_F20_05: Tampered admin header with Bearer invalid-token returns 401', async () => {
      client.setToken('Bearer invalid_token_bytes');
      const res = await client.get('/api/admin/orders');
      assert.strictEqual(res.status, 401);
      client.clearToken();
    });
  });

  // ==========================================
  // F21 Boundaries
  // ==========================================
  describe('F21: Admin Inventory Dashboard Boundaries', () => {
    it('T2_F21_01: Inventory list response headers include JSON content-type', async () => {
      const res = await client.get('/api/inventory');
      assert.match(res.headers['content-type'], /application\/json/i);
    });

    it('T2_F21_02: Grouped inventory maintains all 4 categories even if one has 0 items', async () => {
      const res = await client.get('/api/inventory/grouped');
      assert.strictEqual(typeof res.data.bases, 'object');
      assert.strictEqual(typeof res.data.sauces, 'object');
      assert.strictEqual(typeof res.data.cheeses, 'object');
      assert.strictEqual(typeof res.data.veggies, 'object');
    });

    it('T2_F21_03: Large inventory quantities (e.g. 1000) are accepted and displayed cleanly', async () => {
      client.setToken(adminToken);
      const inv = await client.get('/api/inventory');
      const itemId = inv.data[0]._id;

      const res = await client.put(`/api/inventory/${itemId}/stock`, { stock: 1000 });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.item.stock, 1000);

      // Revert to 50
      await client.put(`/api/inventory/${itemId}/stock`, { stock: 50 });
      client.clearToken();
    });

    it('T2_F21_04: Items with stock = 0 are identifiable as out of stock', async () => {
      client.setToken(adminToken);
      const inv = await client.get('/api/inventory');
      const itemId = inv.data[1]._id;

      await client.put(`/api/inventory/${itemId}/stock`, { stock: 0 });
      const check = await client.get('/api/inventory');
      const item = check.data.find(i => i._id === itemId);
      assert.strictEqual(item.stock, 0);

      // Revert
      await client.put(`/api/inventory/${itemId}/stock`, { stock: 50 });
      client.clearToken();
    });

    it('T2_F21_05: Consumer token attempting to fetch /api/admin/orders returns 403', async () => {
      client.setToken(userToken);
      const res = await client.get('/api/admin/orders');
      assert.strictEqual(res.status, 403);
      client.clearToken();
    });
  });

  // ==========================================
  // F22 Boundaries
  // ==========================================
  describe('F22: Admin Manual Stock Editor Boundaries', () => {
    it('T2_F22_01: Updating stock with empty body returns 200 without changing stock', async () => {
      client.setToken(adminToken);
      const inv = await client.get('/api/inventory');
      const item = inv.data[0];
      const startStock = item.stock;

      const res = await client.put(`/api/inventory/${item._id}/stock`, {});
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.item.stock, startStock);
      client.clearToken();
    });

    it('T2_F22_02: Updating stock with string numbers (e.g. "50") returns 400 Bad Request', async () => {
      client.setToken(adminToken);
      const inv = await client.get('/api/inventory');
      const res = await client.put(`/api/inventory/${inv.data[0]._id}/stock`, {
        stock: '50'
      });
      assert.strictEqual(res.status, 400);
      client.clearToken();
    });

    it('T2_F22_03: Updating threshold with negative value returns 400 Bad Request', async () => {
      client.setToken(adminToken);
      const inv = await client.get('/api/inventory');
      const res = await client.put(`/api/inventory/${inv.data[0]._id}/stock`, {
        threshold: -1
      });
      assert.strictEqual(res.status, 400);
      client.clearToken();
    });

    it('T2_F22_04: Updating stock on invalid URL structure returns 404', async () => {
      client.setToken(adminToken);
      const res = await client.put('/api/inventory/stock', { stock: 10 });
      assert.strictEqual(res.status, 404);
      client.clearToken();
    });

    it('T2_F22_05: Setting stock to exact 0 is allowed and valid (depleted state)', async () => {
      client.setToken(adminToken);
      const inv = await client.get('/api/inventory');
      const itemId = inv.data[0]._id;
      const res = await client.put(`/api/inventory/${itemId}/stock`, { stock: 0 });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.item.stock, 0);

      // Revert
      await client.put(`/api/inventory/${itemId}/stock`, { stock: 50 });
      client.clearToken();
    });
  });

  // ==========================================
  // F23 Boundaries
  // ==========================================
  describe('F23: Admin Order Management Panel Boundaries', () => {
    it('T2_F23_01: Non-admin token patching order status returns 403', async () => {
      client.setToken(userToken);
      const res = await client.patch(`/api/admin/orders/${testOrderId}/status`, {
        status: 'In Kitchen'
      });
      assert.strictEqual(res.status, 403);
      client.clearToken();
    });

    it('T2_F23_02: Admin patching order with empty body returns 400 Bad Request', async () => {
      client.setToken(adminToken);
      const res = await client.patch(`/api/admin/orders/${testOrderId}/status`, {});
      assert.strictEqual(res.status, 400);
      client.clearToken();
    });

    it('T2_F23_03: Admin patching order with null status returns 400', async () => {
      client.setToken(adminToken);
      const res = await client.patch(`/api/admin/orders/${testOrderId}/status`, {
        status: null
      });
      assert.strictEqual(res.status, 400);
      client.clearToken();
    });

    it('T2_F23_04: Admin orders endpoint returns array of orders', async () => {
      client.setToken(adminToken);
      const res = await client.get('/api/admin/orders');
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.data));
      client.clearToken();
    });

    it('T2_F23_05: Order status string is case-sensitive and must match exact enum', async () => {
      client.setToken(adminToken);
      const res = await client.patch(`/api/admin/orders/${testOrderId}/status`, {
        status: 'in kitchen'
      });
      assert.strictEqual(res.status, 400);
      client.clearToken();
    });
  });
});

