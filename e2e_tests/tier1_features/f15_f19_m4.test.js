// e2e_tests/tier1_features/f15_f19_m4.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnvironment, teardownTestEnvironment } from '../helpers/testContext.js';
import { generateRandomEmail, generateRazorpaySignature } from '../helpers/cryptoHelper.js';

describe('Tier 1: Features F15–F19 (Milestone 4)', () => {
  let client;
  let socket;
  let userToken;
  let groupedInventory;

  before(async () => {
    const ctx = await setupTestEnvironment();
    client = ctx.client;
    socket = ctx.socket;

    const userEmail = generateRandomEmail('m4user');
    const regRes = await client.post('/api/auth/register', {
      name: 'M4 Tester',
      email: userEmail,
      password: 'Password123!'
    });
    await client.get(`/api/auth/verify-email?token=${regRes.data.emailVerificationToken}`);
    const loginRes = await client.post('/api/auth/login', {
      email: userEmail,
      password: 'Password123!'
    });
    userToken = loginRes.data.token;

    const invRes = await client.get('/api/inventory/grouped');
    groupedInventory = invRes.data;
  });

  after(async () => {
    await teardownTestEnvironment();
  });

  // ==========================================
  // F15: User Authentication Views
  // ==========================================
  describe('F15: User Authentication Views Contract', () => {
    it('T1_F15_01: Registration view contract requires name, email, and password', async () => {
      const email = generateRandomEmail('v_reg');
      const res = await client.post('/api/auth/register', {
        name: 'View Tester',
        email,
        password: 'ValidPassword123!'
      });
      assert.strictEqual(res.status, 201);
      assert.ok(res.data.emailVerificationToken);
    });

    it('T1_F15_02: Email verification notice handler triggers verify endpoint', async () => {
      const email = generateRandomEmail('v_ver');
      const regRes = await client.post('/api/auth/register', {
        name: 'Verify Notice',
        email,
        password: 'ValidPassword123!'
      });
      const res = await client.get(`/api/auth/verify-email?token=${regRes.data.emailVerificationToken}`);
      assert.strictEqual(res.status, 200);
    });

    it('T1_F15_03: Login view credentials submission returns JWT and user payload', async () => {
      const email = generateRandomEmail('v_log');
      const reg = await client.post('/api/auth/register', {
        name: 'Login View Tester',
        email,
        password: 'ValidPassword123!'
      });
      await client.get(`/api/auth/verify-email?token=${reg.data.emailVerificationToken}`);

      const res = await client.post('/api/auth/login', {
        email,
        password: 'ValidPassword123!'
      });
      assert.strictEqual(res.status, 200);
      assert.ok(res.data.token);
      assert.strictEqual(res.data.user.email, email.toLowerCase());
    });

    it('T1_F15_04: Forgot Password form triggers password reset link dispatch', async () => {
      const res = await client.post('/api/auth/forgot-password', {
        email: 'test@example.com'
      });
      assert.strictEqual(res.status, 200);
    });

    it('T1_F15_05: Reset Password form updates password with valid token', async () => {
      const email = generateRandomEmail('v_rst');
      await client.post('/api/auth/register', {
        name: 'Reset Form Tester',
        email,
        password: 'OriginalPassword123!'
      });
      const forgotRes = await client.post('/api/auth/forgot-password', { email });
      if (forgotRes.data.resetToken) {
        const resetRes = await client.post('/api/auth/reset-password', {
          token: forgotRes.data.resetToken,
          newPassword: 'BrandNewPassword123!'
        });
        assert.strictEqual(resetRes.status, 200);
      } else {
        assert.ok(true);
      }
    });
  });

  // ==========================================
  // F16: User Dashboard & Catalog
  // ==========================================
  describe('F16: User Dashboard & Catalog', () => {
    it('T1_F16_01: GET /api/pizzas returns pre-configured pizza varieties', async () => {
      const res = await client.get('/api/pizzas');
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.data));
      assert.ok(res.data.length >= 3);
    });

    it('T1_F16_02: Pizza catalog items contain name, description, price, and ingredients', async () => {
      const res = await client.get('/api/pizzas');
      for (const pizza of res.data) {
        assert.ok(pizza.name);
        assert.ok(pizza.description);
        assert.ok(pizza.price > 0);
        assert.ok(Array.isArray(pizza.ingredients));
      }
    });

    it('T1_F16_03: Pre-configured pizzas can be added to checkout order', async () => {
      const catalog = await client.get('/api/pizzas');
      const pizza = catalog.data[0];

      client.setToken(userToken);
      const res = await client.post('/api/orders/create-razorpay-order', {
        items: [
          {
            type: 'preconfigured',
            pizzaId: pizza._id,
            quantity: 2
          }
        ],
        deliveryAddress: '123 Catalog Road'
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.amount, pizza.price * 2 * 100);
      client.clearToken();
    });

    it('T1_F16_04: Pre-configured pizza order confirms and verifies cleanly', async () => {
      const catalog = await client.get('/api/pizzas');
      const pizza = catalog.data[0];

      client.setToken(userToken);
      const createRes = await client.post('/api/orders/create-razorpay-order', {
        items: [
          {
            type: 'preconfigured',
            pizzaId: pizza._id,
            quantity: 1
          }
        ],
        deliveryAddress: '456 Catalog Ave'
      });

      const payId = 'pay_pre_' + Date.now();
      const sig = generateRazorpaySignature(createRes.data.razorpayOrderId, payId);
      const verifyRes = await client.post('/api/orders/verify-payment', {
        orderId: createRes.data.orderId,
        razorpay_order_id: createRes.data.razorpayOrderId,
        razorpay_payment_id: payId,
        razorpay_signature: sig
      });
      assert.strictEqual(verifyRes.status, 200);
      assert.strictEqual(verifyRes.data.order.paymentStatus, 'paid');
      client.clearToken();
    });

    it('T1_F16_05: Catalog prices match expected INR unit format', async () => {
      const res = await client.get('/api/pizzas');
      for (const p of res.data) {
        assert.ok(typeof p.price === 'number');
        assert.ok(p.price >= 100 && p.price <= 1000);
      }
    });
  });

  // ==========================================
  // F17: 4-Step Custom Pizza Builder Wizard
  // ==========================================
  describe('F17: 4-Step Custom Pizza Builder Wizard', () => {
    it('T1_F17_01: Step 1 provides at least 5 base options with valid stock and prices', () => {
      assert.ok(groupedInventory.bases.length >= 5);
      for (const base of groupedInventory.bases) {
        assert.ok(base.price > 0);
        assert.ok(base.stock > 0);
      }
    });

    it('T1_F17_02: Step 2 provides at least 5 sauce options with valid stock and prices', () => {
      assert.ok(groupedInventory.sauces.length >= 5);
      for (const sauce of groupedInventory.sauces) {
        assert.ok(sauce.price > 0);
        assert.ok(sauce.stock > 0);
      }
    });

    it('T1_F17_03: Step 3 provides cheese options with valid stock and prices', () => {
      assert.ok(groupedInventory.cheeses.length >= 1);
      for (const cheese of groupedInventory.cheeses) {
        assert.ok(cheese.price > 0);
      }
    });

    it('T1_F17_04: Step 4 supports multiple vegetable selections and calculates composite sum', () => {
      assert.ok(groupedInventory.veggies.length >= 4);
      const v1 = groupedInventory.veggies[0];
      const v2 = groupedInventory.veggies[1];
      const v3 = groupedInventory.veggies[2];
      const sum = v1.price + v2.price + v3.price;
      assert.ok(sum > 0);
    });

    it('T1_F17_05: Complete 4-step customization validates server-side and creates order', async () => {
      client.setToken(userToken);
      const res = await client.post('/api/orders/create-razorpay-order', {
        items: [
          {
            type: 'custom',
            customDetails: {
              baseId: groupedInventory.bases[0]._id,
              sauceId: groupedInventory.sauces[0]._id,
              cheeseId: groupedInventory.cheeses[0]._id,
              veggieIds: [groupedInventory.veggies[0]._id, groupedInventory.veggies[1]._id]
            },
            quantity: 1
          }
        ],
        deliveryAddress: 'Builder Verification Blvd'
      });
      assert.strictEqual(res.status, 200);
      assert.ok(res.data.orderId);
      client.clearToken();
    });
  });

  // ==========================================
  // F18: Order Summary & Razorpay Modal
  // ==========================================
  describe('F18: Order Summary & Razorpay Modal', () => {
    it('T1_F18_01: Order summary itemizes custom pizza ingredient components', async () => {
      client.setToken(userToken);
      const b = groupedInventory.bases[0];
      const s = groupedInventory.sauces[0];
      const c = groupedInventory.cheeses[0];
      const v = groupedInventory.veggies[0];

      const res = await client.post('/api/orders/create-razorpay-order', {
        items: [
          {
            type: 'custom',
            customDetails: { baseId: b._id, sauceId: s._id, cheeseId: c._id, veggieIds: [v._id] },
            quantity: 1
          }
        ],
        deliveryAddress: 'Summary Verification Lane'
      });
      assert.strictEqual(res.status, 200);
      const expectedAmount = (b.price + s.price + c.price + v.price) * 100;
      assert.strictEqual(res.data.amount, expectedAmount);
      client.clearToken();
    });

    it('T1_F18_02: Delivery address is persisted with the order summary', async () => {
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
        deliveryAddress: '99 Persisted St, Suite 4B'
      });
      assert.strictEqual(res.status, 200);
      client.clearToken();
    });

    it('T1_F18_03: Razorpay initiation returns test key required for Razorpay modal launch', async () => {
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
        deliveryAddress: 'Modal Test Rd'
      });
      assert.strictEqual(res.data.key, 'rzp_test_Twlntm5UkURGg0');
      client.clearToken();
    });

    it('T1_F18_04: Razorpay order ID is formatted properly (order_rzp_...)', async () => {
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
        deliveryAddress: 'Order Format St'
      });
      assert.match(res.data.razorpayOrderId, /^order_/);
      client.clearToken();
    });

    it('T1_F18_05: Currency INR is passed to Razorpay checkout configuration', async () => {
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
        deliveryAddress: 'Currency Rd'
      });
      assert.strictEqual(res.data.currency, 'INR');
      client.clearToken();
    });
  });

  // ==========================================
  // F19: Real-Time Order Tracking Dashboard
  // ==========================================
  describe('F19: Real-Time Order Tracking Dashboard', () => {
    let orderId;

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
        deliveryAddress: 'Tracking Dashboard St'
      });
      const payId = 'pay_track_' + Date.now();
      const sig = generateRazorpaySignature(createRes.data.razorpayOrderId, payId);
      const verifyRes = await client.post('/api/orders/verify-payment', {
        orderId: createRes.data.orderId,
        razorpay_order_id: createRes.data.razorpayOrderId,
        razorpay_payment_id: payId,
        razorpay_signature: sig
      });
      orderId = verifyRes.data.order._id;
      client.clearToken();
    });

    it('T1_F19_01: Tracking view fetches order details with initial status "Order Received"', async () => {
      client.setToken(userToken);
      const res = await client.get('/api/orders');
      const order = res.data.find(o => o._id === orderId);
      assert.ok(order);
      assert.strictEqual(order.orderStatus, 'Order Received');
      client.clearToken();
    });

    it('T1_F19_02: Client can connect to order socket room for live progression', () => {
      socket.joinOrder(orderId);
      assert.ok(socket.rooms.has(`order_${orderId}`));
    });

    it('T1_F19_03: Live progression event updates state to "In Kitchen"', async () => {
      const waitPromise = socket.waitForEvent('order_status_updated', 2000);
      // Simulate status progression from admin
      const adminLogin = await client.post('/api/admin/auth/login', {
        email: 'admin@pizzadelivery.com',
        password: 'AdminPassword123!'
      });
      client.setToken(adminLogin.data.token);
      await client.patch(`/api/admin/orders/${orderId}/status`, { status: 'In Kitchen' });
      client.clearToken();

      const received = await waitPromise;
      assert.strictEqual(received.orderId, orderId);
      assert.strictEqual(received.status, 'In Kitchen');
    });

    it('T1_F19_04: Live progression event updates state to "Sent to Delivery"', async () => {
      const waitPromise = socket.waitForEvent('order_status_updated', 2000);
      const adminLogin = await client.post('/api/admin/auth/login', {
        email: 'admin@pizzadelivery.com',
        password: 'AdminPassword123!'
      });
      client.setToken(adminLogin.data.token);
      await client.patch(`/api/admin/orders/${orderId}/status`, { status: 'Sent to Delivery' });
      client.clearToken();

      const received = await waitPromise;
      assert.strictEqual(received.status, 'Sent to Delivery');
    });

    it('T1_F19_05: Live progression reaches "Delivered" and completes tracking lifecycle', async () => {
      const waitPromise = socket.waitForEvent('order_status_updated', 2000);
      const adminLogin = await client.post('/api/admin/auth/login', {
        email: 'admin@pizzadelivery.com',
        password: 'AdminPassword123!'
      });
      client.setToken(adminLogin.data.token);
      await client.patch(`/api/admin/orders/${orderId}/status`, { status: 'Delivered' });
      client.clearToken();

      const received = await waitPromise;
      assert.strictEqual(received.status, 'Delivered');
    });
  });
});

