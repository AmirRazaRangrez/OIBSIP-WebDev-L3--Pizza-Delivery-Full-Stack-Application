// e2e_tests/tier1_features/f07_f12_m2.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnvironment, teardownTestEnvironment } from '../helpers/testContext.js';
import { generateRandomEmail, generateRazorpaySignature } from '../helpers/cryptoHelper.js';
import { config } from '../config.js';

describe('Tier 1: Features F07–F12 (Milestone 2)', () => {
  let client;
  let socket;
  let mockServer;
  let mockDb;
  let userToken;
  let adminToken;
  let groupedInventory;

  before(async () => {
    const ctx = await setupTestEnvironment();
    client = ctx.client;
    socket = ctx.socket;
    mockServer = ctx.mockServer;
    mockDb = ctx.mockDb;

    // Register & Login User
    const userEmail = generateRandomEmail('m2user');
    const regRes = await client.post('/api/auth/register', {
      name: 'M2 Tester',
      email: userEmail,
      password: 'Password123!'
    });
    await client.get(`/api/auth/verify-email?token=${regRes.data.emailVerificationToken}`);
    const loginRes = await client.post('/api/auth/login', {
      email: userEmail,
      password: 'Password123!'
    });
    userToken = loginRes.data.token;

    // Login Admin
    const adminLoginRes = await client.post('/api/admin/auth/login', {
      email: config.adminCredentials.email,
      password: config.adminCredentials.password
    });
    adminToken = adminLoginRes.data.token;

    // Fetch grouped inventory
    const invRes = await client.get('/api/inventory/grouped');
    groupedInventory = invRes.data;
  });

  after(async () => {
    await teardownTestEnvironment();
  });

  // ==========================================
  // F08: Razorpay Test Payment Initiation
  // ==========================================
  describe('F08: Razorpay Test Payment Initiation', () => {
    it('T1_F08_01: Initiates Razorpay test order and returns orderId & razorpayOrderId', async () => {
      client.setToken(userToken);
      const res = await client.post('/api/orders/create-razorpay-order', {
        items: [
          {
            type: 'custom',
            customDetails: {
              baseId: groupedInventory.bases[0]._id,
              sauceId: groupedInventory.sauces[0]._id,
              cheeseId: groupedInventory.cheeses[0]._id,
              veggieIds: [groupedInventory.veggies[0]._id]
            },
            quantity: 1
          }
        ],
        deliveryAddress: '221B Baker Street, London'
      });

      assert.strictEqual(res.status, 200);
      assert.ok(res.data.orderId);
      assert.ok(res.data.razorpayOrderId);
      client.clearToken();
    });

    it('T1_F08_02: Returns configured Razorpay test key ID', async () => {
      client.setToken(userToken);
      const res = await client.post('/api/orders/create-razorpay-order', {
        items: [
          {
            type: 'custom',
            customDetails: {
              baseId: groupedInventory.bases[0]._id,
              sauceId: groupedInventory.sauces[0]._id,
              cheeseId: groupedInventory.cheeses[0]._id,
              veggieIds: []
            },
            quantity: 1
          }
        ],
        deliveryAddress: '42 Wallaby Way, Sydney'
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.key, config.razorpayKeyId);
      client.clearToken();
    });

    it('T1_F08_03: Order amount is computed in paise (rupees * 100)', async () => {
      client.setToken(userToken);
      const basePrice = groupedInventory.bases[0].price;
      const saucePrice = groupedInventory.sauces[0].price;
      const cheesePrice = groupedInventory.cheeses[0].price;
      const expectedTotal = basePrice + saucePrice + cheesePrice;

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
        deliveryAddress: '10 Downing Street'
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.amount, expectedTotal * 100);
      client.clearToken();
    });

    it('T1_F08_04: Currency field is strictly INR', async () => {
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
        deliveryAddress: '1600 Pennsylvania Ave'
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.currency, 'INR');
      client.clearToken();
    });

    it('T1_F08_05: Multi-quantity custom pizza multiplies total amount proportionately', async () => {
      client.setToken(userToken);
      const basePrice = groupedInventory.bases[0].price;
      const saucePrice = groupedInventory.sauces[0].price;
      const cheesePrice = groupedInventory.cheeses[0].price;
      const unitTotal = basePrice + saucePrice + cheesePrice;

      const res = await client.post('/api/orders/create-razorpay-order', {
        items: [
          {
            type: 'custom',
            customDetails: {
              baseId: groupedInventory.bases[0]._id,
              sauceId: groupedInventory.sauces[0]._id,
              cheeseId: groupedInventory.cheeses[0]._id
            },
            quantity: 3
          }
        ],
        deliveryAddress: '742 Evergreen Terrace'
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.amount, unitTotal * 3 * 100);
      client.clearToken();
    });
  });

  // ==========================================
  // F09: Razorpay Verification & Order Placement
  // ==========================================
  describe('F09: Razorpay Verification & Order Placement', () => {
    let testOrder;

    before(async () => {
      client.setToken(userToken);
      const orderRes = await client.post('/api/orders/create-razorpay-order', {
        items: [
          {
            type: 'custom',
            customDetails: {
              baseId: groupedInventory.bases[1]._id,
              sauceId: groupedInventory.sauces[1]._id,
              cheeseId: groupedInventory.cheeses[1]._id,
              veggieIds: [groupedInventory.veggies[1]._id]
            },
            quantity: 1
          }
        ],
        deliveryAddress: '100 Main Street'
      });
      testOrder = orderRes.data;
      client.clearToken();
    });

    it('T1_F09_01: Valid HMAC-SHA256 signature confirms payment with status 200', async () => {
      client.setToken(userToken);
      const paymentId = 'pay_test_' + Date.now();
      const signature = generateRazorpaySignature(testOrder.razorpayOrderId, paymentId);

      const res = await client.post('/api/orders/verify-payment', {
        orderId: testOrder.orderId,
        razorpay_order_id: testOrder.razorpayOrderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.order.paymentStatus, 'paid');
      client.clearToken();
    });

    it('T1_F09_02: Confirmed order has orderStatus set to "Order Received"', async () => {
      client.setToken(userToken);
      const ordersRes = await client.get('/api/orders');
      const found = ordersRes.data.find(o => o._id === testOrder.orderId);
      assert.ok(found);
      assert.strictEqual(found.orderStatus, 'Order Received');
      client.clearToken();
    });

    it('T1_F09_03: Verification records timestamp for paidAt', async () => {
      client.setToken(userToken);
      const ordersRes = await client.get('/api/orders');
      const found = ordersRes.data.find(o => o._id === testOrder.orderId);
      assert.ok(found.paidAt);
      client.clearToken();
    });

    it('T1_F09_04: Verification response returns full order confirmation payload', async () => {
      client.setToken(userToken);
      const createRes = await client.post('/api/orders/create-razorpay-order', {
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
        deliveryAddress: '55 Ocean Ave'
      });

      const payId = 'pay_' + Date.now();
      const sig = generateRazorpaySignature(createRes.data.razorpayOrderId, payId);
      const res = await client.post('/api/orders/verify-payment', {
        orderId: createRes.data.orderId,
        razorpay_order_id: createRes.data.razorpayOrderId,
        razorpay_payment_id: payId,
        razorpay_signature: sig
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.order.items.length, 1);
      client.clearToken();
    });

    it('T1_F09_05: Order records user ID matching authenticated customer', async () => {
      client.setToken(userToken);
      const ordersRes = await client.get('/api/orders');
      assert.ok(ordersRes.data.every(o => Boolean(o.userId)));
      client.clearToken();
    });
  });

  // ==========================================
  // F07: Atomic Stock Decrement Engine
  // ==========================================
  describe('F07: Atomic Stock Decrement Engine', () => {
    it('T1_F07_01: Decrements base stock by exact ordered quantity upon payment confirmation', async () => {
      const invBefore = await client.get('/api/inventory');
      const targetBase = invBefore.data.find(i => i.category === 'base');
      const startStock = targetBase.stock;

      client.setToken(userToken);
      const createRes = await client.post('/api/orders/create-razorpay-order', {
        items: [
          {
            type: 'custom',
            customDetails: {
              baseId: targetBase._id,
              sauceId: groupedInventory.sauces[0]._id,
              cheeseId: groupedInventory.cheeses[0]._id
            },
            quantity: 2
          }
        ],
        deliveryAddress: 'Stock Decrement St'
      });

      const payId = 'pay_dec_' + Date.now();
      const sig = generateRazorpaySignature(createRes.data.razorpayOrderId, payId);
      await client.post('/api/orders/verify-payment', {
        orderId: createRes.data.orderId,
        razorpay_order_id: createRes.data.razorpayOrderId,
        razorpay_payment_id: payId,
        razorpay_signature: sig
      });
      client.clearToken();

      const invAfter = await client.get('/api/inventory');
      const updatedBase = invAfter.data.find(i => i._id === targetBase._id);
      assert.strictEqual(updatedBase.stock, startStock - 2);
    });

    it('T1_F07_02: Decrements sauce stock by exact ordered quantity', async () => {
      const invBefore = await client.get('/api/inventory');
      const targetSauce = invBefore.data.find(i => i.category === 'sauce');
      const startStock = targetSauce.stock;

      client.setToken(userToken);
      const createRes = await client.post('/api/orders/create-razorpay-order', {
        items: [
          {
            type: 'custom',
            customDetails: {
              baseId: groupedInventory.bases[0]._id,
              sauceId: targetSauce._id,
              cheeseId: groupedInventory.cheeses[0]._id
            },
            quantity: 1
          }
        ],
        deliveryAddress: 'Sauce Test St'
      });

      const payId = 'pay_sauce_' + Date.now();
      const sig = generateRazorpaySignature(createRes.data.razorpayOrderId, payId);
      await client.post('/api/orders/verify-payment', {
        orderId: createRes.data.orderId,
        razorpay_order_id: createRes.data.razorpayOrderId,
        razorpay_payment_id: payId,
        razorpay_signature: sig
      });
      client.clearToken();

      const invAfter = await client.get('/api/inventory');
      const updatedSauce = invAfter.data.find(i => i._id === targetSauce._id);
      assert.strictEqual(updatedSauce.stock, startStock - 1);
    });

    it('T1_F07_03: Decrements cheese stock by exact ordered quantity', async () => {
      const invBefore = await client.get('/api/inventory');
      const targetCheese = invBefore.data.find(i => i.category === 'cheese');
      const startStock = targetCheese.stock;

      client.setToken(userToken);
      const createRes = await client.post('/api/orders/create-razorpay-order', {
        items: [
          {
            type: 'custom',
            customDetails: {
              baseId: groupedInventory.bases[0]._id,
              sauceId: groupedInventory.sauces[0]._id,
              cheeseId: targetCheese._id
            },
            quantity: 1
          }
        ],
        deliveryAddress: 'Cheese Test St'
      });

      const payId = 'pay_cheese_' + Date.now();
      const sig = generateRazorpaySignature(createRes.data.razorpayOrderId, payId);
      await client.post('/api/orders/verify-payment', {
        orderId: createRes.data.orderId,
        razorpay_order_id: createRes.data.razorpayOrderId,
        razorpay_payment_id: payId,
        razorpay_signature: sig
      });
      client.clearToken();

      const invAfter = await client.get('/api/inventory');
      const updatedCheese = invAfter.data.find(i => i._id === targetCheese._id);
      assert.strictEqual(updatedCheese.stock, startStock - 1);
    });

    it('T1_F07_04: Decrements all selected vegetables in multi-veggie selection', async () => {
      const v1 = groupedInventory.veggies[0];
      const v2 = groupedInventory.veggies[1];
      const invBefore = await client.get('/api/inventory');
      const s1 = invBefore.data.find(i => i._id === v1._id).stock;
      const s2 = invBefore.data.find(i => i._id === v2._id).stock;

      client.setToken(userToken);
      const createRes = await client.post('/api/orders/create-razorpay-order', {
        items: [
          {
            type: 'custom',
            customDetails: {
              baseId: groupedInventory.bases[0]._id,
              sauceId: groupedInventory.sauces[0]._id,
              cheeseId: groupedInventory.cheeses[0]._id,
              veggieIds: [v1._id, v2._id]
            },
            quantity: 1
          }
        ],
        deliveryAddress: 'Multi Veggie St'
      });

      const payId = 'pay_veg_' + Date.now();
      const sig = generateRazorpaySignature(createRes.data.razorpayOrderId, payId);
      await client.post('/api/orders/verify-payment', {
        orderId: createRes.data.orderId,
        razorpay_order_id: createRes.data.razorpayOrderId,
        razorpay_payment_id: payId,
        razorpay_signature: sig
      });
      client.clearToken();

      const invAfter = await client.get('/api/inventory');
      assert.strictEqual(invAfter.data.find(i => i._id === v1._id).stock, s1 - 1);
      assert.strictEqual(invAfter.data.find(i => i._id === v2._id).stock, s2 - 1);
    });

    it('T1_F07_05: Non-ordered inventory ingredients remain unchanged', async () => {
      const untouched = groupedInventory.bases[4]; // Stuffed Crust
      const invBefore = await client.get('/api/inventory');
      const stockBefore = invBefore.data.find(i => i._id === untouched._id).stock;

      // Place order with base 0
      client.setToken(userToken);
      const createRes = await client.post('/api/orders/create-razorpay-order', {
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
        deliveryAddress: 'Untouched St'
      });
      const payId = 'pay_untouch_' + Date.now();
      const sig = generateRazorpaySignature(createRes.data.razorpayOrderId, payId);
      await client.post('/api/orders/verify-payment', {
        orderId: createRes.data.orderId,
        razorpay_order_id: createRes.data.razorpayOrderId,
        razorpay_payment_id: payId,
        razorpay_signature: sig
      });
      client.clearToken();

      const invAfter = await client.get('/api/inventory');
      assert.strictEqual(invAfter.data.find(i => i._id === untouched._id).stock, stockBefore);
    });
  });

  // ==========================================
  // F10: Order Management Lifecycle
  // ==========================================
  describe('F10: Order Management Lifecycle', () => {
    let orderToProgress;

    before(async () => {
      client.setToken(userToken);
      const createRes = await client.post('/api/orders/create-razorpay-order', {
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
        deliveryAddress: 'Lifecycle Way'
      });
      const payId = 'pay_life_' + Date.now();
      const sig = generateRazorpaySignature(createRes.data.razorpayOrderId, payId);
      const verifyRes = await client.post('/api/orders/verify-payment', {
        orderId: createRes.data.orderId,
        razorpay_order_id: createRes.data.razorpayOrderId,
        razorpay_payment_id: payId,
        razorpay_signature: sig
      });
      orderToProgress = verifyRes.data.order;
      client.clearToken();
    });

    it('T1_F10_01: User queries order history and sees placed order', async () => {
      client.setToken(userToken);
      const res = await client.get('/api/orders');
      assert.strictEqual(res.status, 200);
      assert.ok(res.data.some(o => o._id === orderToProgress._id));
      client.clearToken();
    });

    it('T1_F10_02: Admin queries all orders and sees incoming order', async () => {
      client.setToken(adminToken);
      const res = await client.get('/api/admin/orders');
      assert.strictEqual(res.status, 200);
      assert.ok(res.data.some(o => o._id === orderToProgress._id));
      client.clearToken();
    });

    it('T1_F10_03: Admin transitions status to "In Kitchen"', async () => {
      client.setToken(adminToken);
      const res = await client.patch(`/api/admin/orders/${orderToProgress._id}/status`, {
        status: 'In Kitchen'
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.order.orderStatus, 'In Kitchen');
      client.clearToken();
    });

    it('T1_F10_04: Admin transitions status to "Sent to Delivery"', async () => {
      client.setToken(adminToken);
      const res = await client.patch(`/api/admin/orders/${orderToProgress._id}/status`, {
        status: 'Sent to Delivery'
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.order.orderStatus, 'Sent to Delivery');
      client.clearToken();
    });

    it('T1_F10_05: Admin transitions status to final state "Delivered"', async () => {
      client.setToken(adminToken);
      const res = await client.patch(`/api/admin/orders/${orderToProgress._id}/status`, {
        status: 'Delivered'
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.order.orderStatus, 'Delivered');
      client.clearToken();
    });
  });

  // ==========================================
  // F11: Real-Time WebSocket Infrastructure
  // ==========================================
  describe('F11: Real-Time WebSocket Infrastructure', () => {
    it('T1_F11_01: Socket connects and maintains active state', () => {
      assert.strictEqual(socket.connected, true);
    });

    it('T1_F11_02: Socket joins order room via joinOrder helper', () => {
      socket.joinOrder('test_order_123');
      assert.ok(socket.rooms.has('order_test_order_123'));
    });

    it('T1_F11_03: Admin status update triggers order_status_updated to joined room', async () => {
      client.setToken(userToken);
      const createRes = await client.post('/api/orders/create-razorpay-order', {
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
        deliveryAddress: 'Socket Test Blvd'
      });
      const payId = 'pay_sock_' + Date.now();
      const sig = generateRazorpaySignature(createRes.data.razorpayOrderId, payId);
      const verifyRes = await client.post('/api/orders/verify-payment', {
        orderId: createRes.data.orderId,
        razorpay_order_id: createRes.data.razorpayOrderId,
        razorpay_payment_id: payId,
        razorpay_signature: sig
      });
      const order = verifyRes.data.order;
      client.clearToken();

      socket.joinOrder(order._id);

      const statusPromise = socket.waitForEvent('order_status_updated', 2000);

      client.setToken(adminToken);
      await client.patch(`/api/admin/orders/${order._id}/status`, {
        status: 'In Kitchen'
      });
      client.clearToken();

      const received = await statusPromise;
      assert.strictEqual(received.orderId, order._id);
      assert.strictEqual(received.status, 'In Kitchen');
    });

    it('T1_F11_04: Inventory update broadcasts inventory_updated event', async () => {
      const invPromise = socket.waitForEvent('inventory_updated', 2000);

      client.setToken(adminToken);
      await client.put(`/api/inventory/${groupedInventory.bases[0]._id}/stock`, {
        stock: 45
      });
      client.clearToken();

      const received = await invPromise;
      assert.strictEqual(received.inventoryId, groupedInventory.bases[0]._id);
      assert.strictEqual(received.currentStock, 45);
    });

    it('T1_F11_05: New paid order emits new_order_placed to admin room', async () => {
      socket.joinRoom('admin_orders');
      const orderPlacedPromise = socket.waitForEvent('new_order_placed', 2000);

      client.setToken(userToken);
      const createRes = await client.post('/api/orders/create-razorpay-order', {
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
        deliveryAddress: 'Admin Room St'
      });
      const payId = 'pay_adm_' + Date.now();
      const sig = generateRazorpaySignature(createRes.data.razorpayOrderId, payId);
      await client.post('/api/orders/verify-payment', {
        orderId: createRes.data.orderId,
        razorpay_order_id: createRes.data.razorpayOrderId,
        razorpay_payment_id: payId,
        razorpay_signature: sig
      });
      client.clearToken();

      const received = await orderPlacedPromise;
      assert.strictEqual(received.orderId, createRes.data.orderId);
    });
  });

  // ==========================================
  // F12: Automated Low-Stock Cron Alerts
  // ==========================================
  describe('F12: Automated Low-Stock Cron Alerts', () => {
    it('T1_F12_01: Evaluates inventory items and flags items where stock < threshold', async () => {
      client.setToken(adminToken);
      await client.put(`/api/inventory/${groupedInventory.bases[2]._id}/stock`, {
        stock: 12,
        threshold: 20
      });
      client.clearToken();

      const alerts = mockServer.checkLowStock();
      assert.ok(alerts.some(a => a.itemId === groupedInventory.bases[2]._id));
    });

    it('T1_F12_02: Items with stock >= threshold are not flagged', async () => {
      client.setToken(adminToken);
      await client.put(`/api/inventory/${groupedInventory.bases[3]._id}/stock`, {
        stock: 50,
        threshold: 20
      });
      client.clearToken();

      const alerts = mockServer.checkLowStock();
      assert.ok(!alerts.some(a => a.itemId === groupedInventory.bases[3]._id));
    });

    it('T1_F12_03: Low-stock notification includes item name, category, stock, and threshold', () => {
      const alerts = mockServer.checkLowStock();
      const alertItem = alerts.find(a => a.itemId === groupedInventory.bases[2]._id);
      assert.ok(alertItem.name);
      assert.ok(alertItem.category);
      assert.strictEqual(alertItem.stock, 12);
      assert.strictEqual(alertItem.threshold, 20);
    });

    it('T1_F12_04: Restocking item above threshold clears it from next alert evaluation', async () => {
      client.setToken(adminToken);
      await client.put(`/api/inventory/${groupedInventory.bases[2]._id}/stock`, {
        stock: 40,
        threshold: 20
      });
      client.clearToken();

      const freshAlerts = mockServer.checkLowStock();
      assert.ok(!freshAlerts.some(a => a.itemId === groupedInventory.bases[2]._id));
    });

    it('T1_F12_05: Cron check executes cleanly without throwing errors', () => {
      assert.doesNotThrow(() => {
        mockServer.checkLowStock();
      });
    });
  });
});

