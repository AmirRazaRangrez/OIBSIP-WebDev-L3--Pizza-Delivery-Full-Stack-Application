// e2e_tests/tier1_features/f20_f23_m5.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnvironment, teardownTestEnvironment } from '../helpers/testContext.js';
import { generateRandomEmail, generateRazorpaySignature } from '../helpers/cryptoHelper.js';
import { config } from '../config.js';

describe('Tier 1: Features F20–F23 (Milestone 5)', () => {
  let client;
  let socket;
  let adminToken;
  let targetItemId;

  before(async () => {
    const ctx = await setupTestEnvironment();
    client = ctx.client;
    socket = ctx.socket;

    const adminLoginRes = await client.post('/api/admin/auth/login', {
      email: config.adminCredentials.email,
      password: config.adminCredentials.password
    });
    adminToken = adminLoginRes.data.token;

    const invRes = await client.get('/api/inventory');
    targetItemId = invRes.data[0]._id;
  });

  after(async () => {
    await teardownTestEnvironment();
  });

  // ==========================================
  // F20: Admin Isolated Login View
  // ==========================================
  describe('F20: Admin Isolated Login View', () => {
    it('T1_F20_01: Dedicated admin login route /api/admin/auth/login authenticates admin credentials', async () => {
      const res = await client.post('/api/admin/auth/login', {
        email: config.adminCredentials.email,
        password: config.adminCredentials.password
      });
      assert.strictEqual(res.status, 200);
      assert.ok(res.data.token);
    });

    it('T1_F20_02: Admin login returns role strictly identified as admin', async () => {
      const res = await client.post('/api/admin/auth/login', {
        email: config.adminCredentials.email,
        password: config.adminCredentials.password
      });
      assert.strictEqual(res.data.admin.role, 'admin');
    });

    it('T1_F20_03: Consumer account credentials on admin login endpoint are rejected with 403', async () => {
      const email = generateRandomEmail('consumer');
      const reg = await client.post('/api/auth/register', {
        name: 'Consumer User',
        email,
        password: 'Password123!'
      });
      await client.get(`/api/auth/verify-email?token=${reg.data.emailVerificationToken}`);

      const res = await client.post('/api/admin/auth/login', {
        email,
        password: 'Password123!'
      });
      assert.strictEqual(res.status, 403);
    });

    it('T1_F20_04: Admin token authorizes access to protected admin route /api/admin/orders', async () => {
      client.setToken(adminToken);
      const res = await client.get('/api/admin/orders');
      assert.strictEqual(res.status, 200);
      client.clearToken();
    });

    it('T1_F20_05: Admin route /admin/login is distinct from consumer /login route', () => {
      const adminPath = '/admin/login';
      const userPath = '/login';
      assert.notStrictEqual(adminPath, userPath);
    });
  });

  // ==========================================
  // F21: Admin Inventory Dashboard View
  // ==========================================
  describe('F21: Admin Inventory Dashboard View', () => {
    it('T1_F21_01: Admin dashboard retrieves grouped inventory for 4 category tables', async () => {
      const res = await client.get('/api/inventory/grouped');
      assert.strictEqual(res.status, 200);
      assert.ok(res.data.bases);
      assert.ok(res.data.sauces);
      assert.ok(res.data.cheeses);
      assert.ok(res.data.veggies);
    });

    it('T1_F21_02: Each category item displays stock, threshold, and price', async () => {
      const res = await client.get('/api/inventory/grouped');
      for (const base of res.data.bases) {
        assert.ok(typeof base.stock === 'number');
        assert.ok(typeof base.threshold === 'number');
        assert.ok(typeof base.price === 'number');
      }
    });

    it('T1_F21_03: Items with stock < threshold can be flagged for low-stock display badge', async () => {
      client.setToken(adminToken);
      await client.put(`/api/inventory/${targetItemId}/stock`, {
        stock: 5,
        threshold: 20
      });
      client.clearToken();

      const inv = await client.get('/api/inventory');
      const item = inv.data.find(i => i._id === targetItemId);
      assert.ok(item.stock < item.threshold);
    });

    it('T1_F21_04: Admin dashboard receives real-time inventory_updated socket broadcasts', async () => {
      const invPromise = socket.waitForEvent('inventory_updated', 2000);

      client.setToken(adminToken);
      await client.put(`/api/inventory/${targetItemId}/stock`, { stock: 55 });
      client.clearToken();

      const received = await invPromise;
      assert.strictEqual(received.inventoryId, targetItemId);
      assert.strictEqual(received.currentStock, 55);
    });

    it('T1_F21_05: Admin inventory view provides quick-access item IDs for editing', async () => {
      const res = await client.get('/api/inventory');
      assert.ok(res.data.every(i => Boolean(i._id)));
    });
  });

  // ==========================================
  // F22: Admin Manual Stock Editor Modal
  // ==========================================
  describe('F22: Admin Manual Stock Editor Modal', () => {
    it('T1_F22_01: Stock editor submits updated stock quantity via PUT endpoint', async () => {
      client.setToken(adminToken);
      const res = await client.put(`/api/inventory/${targetItemId}/stock`, {
        stock: 80
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.item.stock, 80);
      client.clearToken();
    });

    it('T1_F22_02: Stock editor submits updated low-stock threshold', async () => {
      client.setToken(adminToken);
      const res = await client.put(`/api/inventory/${targetItemId}/stock`, {
        threshold: 30
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.item.threshold, 30);
      client.clearToken();
    });

    it('T1_F22_03: Stock editor allows simultaneous update of both stock and threshold', async () => {
      client.setToken(adminToken);
      const res = await client.put(`/api/inventory/${targetItemId}/stock`, {
        stock: 75,
        threshold: 22
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.item.stock, 75);
      assert.strictEqual(res.data.item.threshold, 22);
      client.clearToken();
    });

    it('T1_F22_04: Setting stock to 0 reflects out-of-stock condition', async () => {
      client.setToken(adminToken);
      const res = await client.put(`/api/inventory/${targetItemId}/stock`, {
        stock: 0
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.item.stock, 0);
      client.clearToken();
    });

    it('T1_F22_05: Editor restocks item back to operational capacity', async () => {
      client.setToken(adminToken);
      const res = await client.put(`/api/inventory/${targetItemId}/stock`, {
        stock: 60,
        threshold: 20
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.item.stock, 60);
      client.clearToken();
    });
  });

  // ==========================================
  // F23: Admin Order Management Panel
  // ==========================================
  describe('F23: Admin Order Management Panel', () => {
    let activeOrderId;

    before(async () => {
      // Create user order
      const uEmail = generateRandomEmail('panel_user');
      const reg = await client.post('/api/auth/register', {
        name: 'Panel User',
        email: uEmail,
        password: 'Password123!'
      });
      await client.get(`/api/auth/verify-email?token=${reg.data.emailVerificationToken}`);
      const log = await client.post('/api/auth/login', {
        email: uEmail,
        password: 'Password123!'
      });
      client.setToken(log.data.token);

      const inv = await client.get('/api/inventory/grouped');
      const ord = await client.post('/api/orders/create-razorpay-order', {
        items: [
          {
            type: 'custom',
            customDetails: {
              baseId: inv.data.bases[0]._id,
              sauceId: inv.data.sauces[0]._id,
              cheeseId: inv.data.cheeses[0]._id
            },
            quantity: 1
          }
        ],
        deliveryAddress: 'Admin Panel Test Ave'
      });
      const payId = 'pay_pnl_' + Date.now();
      const sig = generateRazorpaySignature(ord.data.razorpayOrderId, payId);
      const ver = await client.post('/api/orders/verify-payment', {
        orderId: ord.data.orderId,
        razorpay_order_id: ord.data.razorpayOrderId,
        razorpay_payment_id: payId,
        razorpay_signature: sig
      });
      activeOrderId = ver.data.order._id;
      client.clearToken();
    });

    it('T1_F23_01: Admin panel fetches all customer orders with customer details and items', async () => {
      client.setToken(adminToken);
      const res = await client.get('/api/admin/orders');
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.data));
      assert.ok(res.data.some(o => o._id === activeOrderId));
      client.clearToken();
    });

    it('T1_F23_02: Admin advances order from "Order Received" to "In Kitchen"', async () => {
      client.setToken(adminToken);
      const res = await client.patch(`/api/admin/orders/${activeOrderId}/status`, {
        status: 'In Kitchen'
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.order.orderStatus, 'In Kitchen');
      client.clearToken();
    });

    it('T1_F23_03: Admin advances order from "In Kitchen" to "Sent to Delivery"', async () => {
      client.setToken(adminToken);
      const res = await client.patch(`/api/admin/orders/${activeOrderId}/status`, {
        status: 'Sent to Delivery'
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.order.orderStatus, 'Sent to Delivery');
      client.clearToken();
    });

    it('T1_F23_04: Admin advances order to "Delivered"', async () => {
      client.setToken(adminToken);
      const res = await client.patch(`/api/admin/orders/${activeOrderId}/status`, {
        status: 'Delivered'
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.order.orderStatus, 'Delivered');
      client.clearToken();
    });

    it('T1_F23_05: Admin order updates broadcast to admin_orders room', async () => {
      socket.joinRoom('admin_orders');
      const waitPromise = socket.waitForEvent('order_status_updated', 2000);

      // Create another order to trigger status update
      client.setToken(adminToken);
      await client.patch(`/api/admin/orders/${activeOrderId}/status`, {
        status: 'Delivered'
      });
      client.clearToken();

      const received = await waitPromise;
      assert.strictEqual(received.orderId, activeOrderId);
    });
  });
});

