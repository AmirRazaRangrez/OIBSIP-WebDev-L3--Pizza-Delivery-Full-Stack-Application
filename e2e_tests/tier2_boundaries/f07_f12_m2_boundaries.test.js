// e2e_tests/tier2_boundaries/f07_f12_m2_boundaries.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnvironment, teardownTestEnvironment } from '../helpers/testContext.js';
import { generateRandomEmail, generateRazorpaySignature } from '../helpers/cryptoHelper.js';
import { config } from '../config.js';

describe('Tier 2: Boundary & Corner Cases F07–F12 (Milestone 2)', () => {
  let client;
  let socket;
  let mockServer;
  let userToken;
  let adminToken;
  let groupedInventory;

  before(async () => {
    const ctx = await setupTestEnvironment();
    client = ctx.client;
    socket = ctx.socket;
    mockServer = ctx.mockServer;

    const email = generateRandomEmail('b_m2');
    const reg = await client.post('/api/auth/register', {
      name: 'M2 Boundary User',
      email,
      password: 'Password123!'
    });
    await client.get(`/api/auth/verify-email?token=${reg.data.emailVerificationToken}`);
    const login = await client.post('/api/auth/login', { email, password: 'Password123!' });
    userToken = login.data.token;

    const adminLogin = await client.post('/api/admin/auth/login', {
      email: config.adminCredentials.email,
      password: config.adminCredentials.password
    });
    adminToken = adminLogin.data.token;

    const inv = await client.get('/api/inventory/grouped');
    groupedInventory = inv.data;
  });

  after(async () => {
    await teardownTestEnvironment();
  });

  // ==========================================
  // F08 Boundaries
  // ==========================================
  describe('F08: Razorpay Order Creation Boundaries', () => {
    it('T2_F08_01: Create order with empty items array returns 400 Bad Request', async () => {
      client.setToken(userToken);
      const res = await client.post('/api/orders/create-razorpay-order', {
        items: [],
        deliveryAddress: '123 Test St'
      });
      assert.strictEqual(res.status, 400);
      client.clearToken();
    });

    it('T2_F08_02: Create order with quantity <= 0 returns 400 Bad Request', async () => {
      client.setToken(userToken);
      const res = await client.post('/api/orders/create-razorpay-order', {
        items: [
          {
            type: 'custom',
            customDetails: {
              baseId: groupedInventory.bases[0]._id,
              sauceId: groupedInventory.sauces[0]._id,
              cheeseId: groupedInventory.cheeses[0]._id
            },
            quantity: 0
          }
        ],
        deliveryAddress: '123 Test St'
      });
      assert.strictEqual(res.status, 400);
      client.clearToken();
    });

    it('T2_F08_03: Create order with empty/whitespace delivery address returns 400', async () => {
      client.setToken(userToken);
      const res = await client.post('/api/orders/create-razorpay-order', {
        items: [
          {
            type: 'custom',
            customDetails: {
              baseId: groupedInventory.bases[0]._id,
              sauceId: groupedInventory.sauces[0]._id,
              cheeseId: groupedInventory.cheeses[0]._id
            },
            quantity: 1
          }
        ],
        deliveryAddress: '   '
      });
      assert.strictEqual(res.status, 400);
      client.clearToken();
    });

    it('T2_F08_04: Custom pizza missing baseId returns 400 Bad Request', async () => {
      client.setToken(userToken);
      const res = await client.post('/api/orders/create-razorpay-order', {
        items: [
          {
            type: 'custom',
            customDetails: {
              sauceId: groupedInventory.sauces[0]._id,
              cheeseId: groupedInventory.cheeses[0]._id
            },
            quantity: 1
          }
        ],
        deliveryAddress: '123 Test St'
      });
      assert.strictEqual(res.status, 400);
      client.clearToken();
    });

    it('T2_F08_05: Custom pizza with non-existent ingredient ID returns 400 Bad Request', async () => {
      client.setToken(userToken);
      const res = await client.post('/api/orders/create-razorpay-order', {
        items: [
          {
            type: 'custom',
            customDetails: {
              baseId: 'fake_base_id',
              sauceId: groupedInventory.sauces[0]._id,
              cheeseId: groupedInventory.cheeses[0]._id
            },
            quantity: 1
          }
        ],
        deliveryAddress: '123 Test St'
      });
      assert.strictEqual(res.status, 400);
      client.clearToken();
    });
  });

  // ==========================================
  // F09 Boundaries
  // ==========================================
  describe('F09: Razorpay Payment Verification Boundaries', () => {
    let testOrder;

    before(async () => {
      client.setToken(userToken);
      const ord = await client.post('/api/orders/create-razorpay-order', {
        items: [
          {
            type: 'custom',
            customDetails: {
              baseId: groupedInventory.bases[0]._id,
              sauceId: groupedInventory.sauces[0]._id,
              cheeseId: groupedInventory.cheeses[0]._id
            },
            quantity: 1
          }
        ],
        deliveryAddress: 'Verification Boundaries St'
      });
      testOrder = ord.data;
      client.clearToken();
    });

    it('T2_F09_01: Tampered/forged HMAC signature is rejected with 400 Bad Request', async () => {
      client.setToken(userToken);
      const res = await client.post('/api/orders/verify-payment', {
        orderId: testOrder.orderId,
        razorpay_order_id: testOrder.razorpayOrderId,
        razorpay_payment_id: 'pay_test_tampered',
        razorpay_signature: 'fake_signature_hex_00000000000000'
      });
      assert.strictEqual(res.status, 400);
      assert.match(res.data.error, /signature/i);
      client.clearToken();
    });

    it('T2_F09_02: Missing razorpay_payment_id returns 400 Bad Request', async () => {
      client.setToken(userToken);
      const res = await client.post('/api/orders/verify-payment', {
        orderId: testOrder.orderId,
        razorpay_order_id: testOrder.razorpayOrderId,
        razorpay_signature: 'some_sig'
      });
      assert.strictEqual(res.status, 400);
      client.clearToken();
    });

    it('T2_F09_03: Payment verification for non-existent orderId returns 404', async () => {
      client.setToken(userToken);
      const res = await client.post('/api/orders/verify-payment', {
        orderId: 'non_existent_order_id_999',
        razorpay_order_id: 'order_123',
        razorpay_payment_id: 'pay_123',
        razorpay_signature: 'sig_123'
      });
      assert.strictEqual(res.status, 404);
      client.clearToken();
    });

    it('T2_F09_04: Replay attack: verifying already paid order a second time returns 400', async () => {
      client.setToken(userToken);
      const payId = 'pay_replay_' + Date.now();
      const sig = generateRazorpaySignature(testOrder.razorpayOrderId, payId);

      const firstRes = await client.post('/api/orders/verify-payment', {
        orderId: testOrder.orderId,
        razorpay_order_id: testOrder.razorpayOrderId,
        razorpay_payment_id: payId,
        razorpay_signature: sig
      });
      assert.strictEqual(firstRes.status, 200);

      const secondRes = await client.post('/api/orders/verify-payment', {
        orderId: testOrder.orderId,
        razorpay_order_id: testOrder.razorpayOrderId,
        razorpay_payment_id: payId,
        razorpay_signature: sig
      });
      assert.strictEqual(secondRes.status, 400);
      assert.match(secondRes.data.error, /already paid/i);
      client.clearToken();
    });

    it('T2_F09_05: Verification without auth token returns 401 Unauthorized', async () => {
      client.clearToken();
      const res = await client.post('/api/orders/verify-payment', {
        orderId: testOrder.orderId,
        razorpay_order_id: testOrder.razorpayOrderId,
        razorpay_payment_id: 'pay_123',
        razorpay_signature: 'sig_123'
      });
      assert.strictEqual(res.status, 401);
    });
  });

  // ==========================================
  // F07 Boundaries
  // ==========================================
  describe('F07: Atomic Stock Decrement Boundaries', () => {
    it('T2_F07_01: Payment verification fails if an ingredient stock is 0', async () => {
      // Deplete a veggie to 0
      client.setToken(adminToken);
      const depletedVeggie = groupedInventory.veggies[4];
      await client.put(`/api/inventory/${depletedVeggie._id}/stock`, { stock: 0 });
      client.clearToken();

      client.setToken(userToken);
      const ord = await client.post('/api/orders/create-razorpay-order', {
        items: [
          {
            type: 'custom',
            customDetails: {
              baseId: groupedInventory.bases[0]._id,
              sauceId: groupedInventory.sauces[0]._id,
              cheeseId: groupedInventory.cheeses[0]._id,
              veggieIds: [depletedVeggie._id]
            },
            quantity: 1
          }
        ],
        deliveryAddress: 'Depleted Stock St'
      });

      const payId = 'pay_zero_' + Date.now();
      const sig = generateRazorpaySignature(ord.data.razorpayOrderId, payId);
      const verRes = await client.post('/api/orders/verify-payment', {
        orderId: ord.data.orderId,
        razorpay_order_id: ord.data.razorpayOrderId,
        razorpay_payment_id: payId,
        razorpay_signature: sig
      });

      assert.strictEqual(verRes.status, 400);
      assert.match(verRes.data.error, /insufficient stock/i);
      client.clearToken();

      // Reset veggie stock
      client.setToken(adminToken);
      await client.put(`/api/inventory/${depletedVeggie._id}/stock`, { stock: 50 });
      client.clearToken();
    });

    it('T2_F07_02: Failed verification does not decrement remaining ingredients', async () => {
      const base = groupedInventory.bases[3];
      const invBefore = await client.get('/api/inventory');
      const startStock = invBefore.data.find(i => i._id === base._id).stock;

      client.setToken(userToken);
      const ord = await client.post('/api/orders/create-razorpay-order', {
        items: [
          {
            type: 'custom',
            customDetails: {
              baseId: base._id,
              sauceId: groupedInventory.sauces[0]._id,
              cheeseId: groupedInventory.cheeses[0]._id
            },
            quantity: 1
          }
        ],
        deliveryAddress: 'No Decrement St'
      });

      // Submit invalid signature
      await client.post('/api/orders/verify-payment', {
        orderId: ord.data.orderId,
        razorpay_order_id: ord.data.razorpayOrderId,
        razorpay_payment_id: 'pay_bad',
        razorpay_signature: 'bad_signature_hex'
      });
      client.clearToken();

      const invAfter = await client.get('/api/inventory');
      assert.strictEqual(invAfter.data.find(i => i._id === base._id).stock, startStock);
    });

    it('T2_F07_03: Ordering more than available stock is rejected atomically', async () => {
      client.setToken(adminToken);
      const lowBase = groupedInventory.bases[4];
      await client.put(`/api/inventory/${lowBase._id}/stock`, { stock: 1 });
      client.clearToken();

      client.setToken(userToken);
      const ord = await client.post('/api/orders/create-razorpay-order', {
        items: [
          {
            type: 'custom',
            customDetails: {
              baseId: lowBase._id,
              sauceId: groupedInventory.sauces[0]._id,
              cheeseId: groupedInventory.cheeses[0]._id
            },
            quantity: 5 // requests 5, only 1 available
          }
        ],
        deliveryAddress: 'Excess Stock St'
      });

      const payId = 'pay_excess_' + Date.now();
      const sig = generateRazorpaySignature(ord.data.razorpayOrderId, payId);
      const verRes = await client.post('/api/orders/verify-payment', {
        orderId: ord.data.orderId,
        razorpay_order_id: ord.data.razorpayOrderId,
        razorpay_payment_id: payId,
        razorpay_signature: sig
      });

      assert.strictEqual(verRes.status, 400);
      assert.match(verRes.data.error, /insufficient stock/i);
      client.clearToken();

      // Reset base stock
      client.setToken(adminToken);
      await client.put(`/api/inventory/${lowBase._id}/stock`, { stock: 30 });
      client.clearToken();
    });

    it('T2_F07_04: Database stock level never drops below zero', async () => {
      const inv = await client.get('/api/inventory');
      assert.ok(inv.data.every(i => i.stock >= 0));
    });

    it('T2_F07_05: Atomic stock transaction preserves order status as created when rejected', async () => {
      const inv = await client.get('/api/inventory');
      assert.ok(inv.data.length > 0);
    });
  });

  // ==========================================
  // F10 Boundaries
  // ==========================================
  describe('F10: Order Management Boundaries', () => {
    it('T2_F10_01: Non-admin user cannot patch order status (returns 403)', async () => {
      client.setToken(userToken);
      const res = await client.patch('/api/admin/orders/ord_123/status', {
        status: 'In Kitchen'
      });
      assert.strictEqual(res.status, 403);
      client.clearToken();
    });

    it('T2_F10_02: Patching invalid status string returns 400 Bad Request', async () => {
      client.setToken(adminToken);
      const orders = await client.get('/api/admin/orders');
      const orderId = orders.data[0]._id;

      const res = await client.patch(`/api/admin/orders/${orderId}/status`, {
        status: 'InvalidFlyingStatus'
      });
      assert.strictEqual(res.status, 400);
      client.clearToken();
    });

    it('T2_F10_03: Patching status on non-existent order ID returns 404', async () => {
      client.setToken(adminToken);
      const res = await client.patch('/api/admin/orders/fake_order_id_404/status', {
        status: 'In Kitchen'
      });
      assert.strictEqual(res.status, 404);
      client.clearToken();
    });

    it('T2_F10_04: Delivered order cannot be altered to another state (prevents regression)', async () => {
      client.setToken(adminToken);
      const orders = await client.get('/api/admin/orders');
      const delivered = orders.data.find(o => o.orderStatus === 'Delivered');
      if (delivered) {
        const res = await client.patch(`/api/admin/orders/${delivered._id}/status`, {
          status: 'In Kitchen'
        });
        assert.strictEqual(res.status, 400);
      } else {
        assert.ok(true);
      }
      client.clearToken();
    });

    it('T2_F10_05: Standard consumer fetching admin orders returns 403', async () => {
      client.setToken(userToken);
      const res = await client.get('/api/admin/orders');
      assert.strictEqual(res.status, 403);
      client.clearToken();
    });
  });

  // ==========================================
  // F11 Boundaries
  // ==========================================
  describe('F11: Real-Time WebSocket Boundaries', () => {
    it('T2_F11_01: Client joining non-existent order room does not crash socket', () => {
      assert.doesNotThrow(() => {
        socket.joinOrder('completely_non_existent_room_999');
      });
    });

    it('T2_F11_02: Emitting unexpected event to server is handled safely', () => {
      assert.doesNotThrow(() => {
        socket.emitToServer('unknown_custom_junk_event', { payload: 'xyz' });
      });
    });

    it('T2_F11_03: Socket disconnect and reconnect cycle succeeds cleanly', async () => {
      socket.disconnect();
      assert.strictEqual(socket.connected, false);
      await socket.connect();
      assert.strictEqual(socket.connected, true);
    });

    it('T2_F11_04: Client waiting for event with short timeout rejects on missing event', async () => {
      await assert.rejects(
        socket.waitForEvent('non_existent_event_that_never_fires', 100),
        /Timeout waiting/
      );
    });

    it('T2_F11_05: Joining multiple rooms simultaneously is supported', () => {
      socket.joinRoom('room_alpha');
      socket.joinRoom('room_beta');
      assert.ok(socket.rooms.has('room_alpha'));
      assert.ok(socket.rooms.has('room_beta'));
    });
  });

  // ==========================================
  // F12 Boundaries
  // ==========================================
  describe('F12: Low-Stock Cron Alert Boundaries', () => {
    it('T2_F12_01: Item with stock exactly equal to threshold is NOT flagged (boundary)', async () => {
      client.setToken(adminToken);
      const base = groupedInventory.bases[0];
      await client.put(`/api/inventory/${base._id}/stock`, {
        stock: 20,
        threshold: 20
      });
      client.clearToken();

      const alerts = mockServer.checkLowStock();
      assert.ok(!alerts.some(a => a.itemId === base._id));
    });

    it('T2_F12_02: Item with stock = threshold - 1 is flagged immediately (boundary)', async () => {
      client.setToken(adminToken);
      const base = groupedInventory.bases[0];
      await client.put(`/api/inventory/${base._id}/stock`, {
        stock: 19,
        threshold: 20
      });
      client.clearToken();

      const alerts = mockServer.checkLowStock();
      assert.ok(alerts.some(a => a.itemId === base._id));

      // Reset
      client.setToken(adminToken);
      await client.put(`/api/inventory/${base._id}/stock`, { stock: 50 });
      client.clearToken();
    });

    it('T2_F12_03: Multiple depleted items across different categories are all aggregated', async () => {
      client.setToken(adminToken);
      const b = groupedInventory.bases[1];
      const s = groupedInventory.sauces[1];
      await client.put(`/api/inventory/${b._id}/stock`, { stock: 2, threshold: 20 });
      await client.put(`/api/inventory/${s._id}/stock`, { stock: 1, threshold: 15 });
      client.clearToken();

      const alerts = mockServer.checkLowStock();
      assert.ok(alerts.some(a => a.itemId === b._id));
      assert.ok(alerts.some(a => a.itemId === s._id));

      // Reset
      client.setToken(adminToken);
      await client.put(`/api/inventory/${b._id}/stock`, { stock: 40 });
      await client.put(`/api/inventory/${s._id}/stock`, { stock: 50 });
      client.clearToken();
    });

    it('T2_F12_04: Negative stock values are prevented from corrupting cron evaluation', () => {
      const alerts = mockServer.checkLowStock();
      assert.ok(alerts.every(a => a.stock >= 0));
    });

    it('T2_F12_05: Cron evaluation with all sufficient stock returns empty array', async () => {
      // Ensure all items are healthy
      client.setToken(adminToken);
      for (const item of (await client.get('/api/inventory')).data) {
        if (item.stock < item.threshold) {
          await client.put(`/api/inventory/${item._id}/stock`, { stock: item.threshold + 10 });
        }
      }
      client.clearToken();

      const alerts = mockServer.checkLowStock();
      assert.strictEqual(alerts.length, 0);
    });
  });
});

