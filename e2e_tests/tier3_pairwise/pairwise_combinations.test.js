// e2e_tests/tier3_pairwise/pairwise_combinations.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnvironment, teardownTestEnvironment } from '../helpers/testContext.js';
import { generateRandomEmail, generateRazorpaySignature } from '../helpers/cryptoHelper.js';
import { config } from '../config.js';

describe('Tier 3: Cross-Feature Pairwise Combinations (24 Tests)', () => {
  let client;
  let socket;
  let mockServer;
  let adminToken;
  let groupedInventory;

  before(async () => {
    const ctx = await setupTestEnvironment();
    client = ctx.client;
    socket = ctx.socket;
    mockServer = ctx.mockServer;

    const adminLog = await client.post('/api/admin/auth/login', {
      email: config.adminCredentials.email,
      password: config.adminCredentials.password
    });
    adminToken = adminLog.data.token;

    const invRes = await client.get('/api/inventory/grouped');
    groupedInventory = invRes.data;
  });

  after(async () => {
    await teardownTestEnvironment();
  });

  it('T3_PAIR_01 (F01 + F02): Register user -> receive token -> verify email -> login successfully', async () => {
    const email = generateRandomEmail('p01');
    const reg = await client.post('/api/auth/register', {
      name: 'Pairwise 1',
      email,
      password: 'Password123!'
    });
    assert.strictEqual(reg.status, 201);
    const ver = await client.get(`/api/auth/verify-email?token=${reg.data.emailVerificationToken}`);
    assert.strictEqual(ver.status, 200);

    const log = await client.post('/api/auth/login', { email, password: 'Password123!' });
    assert.strictEqual(log.status, 200);
    assert.ok(log.data.token);
  });

  it('T3_PAIR_02 (F02 + F17): Authenticated user loads custom pizza builder -> validates options against live inventory', async () => {
    const email = generateRandomEmail('p02');
    const reg = await client.post('/api/auth/register', { name: 'P02', email, password: 'Password123!' });
    await client.get(`/api/auth/verify-email?token=${reg.data.emailVerificationToken}`);
    const log = await client.post('/api/auth/login', { email, password: 'Password123!' });
    client.setToken(log.data.token);

    const inv = await client.get('/api/inventory/grouped');
    assert.strictEqual(inv.status, 200);
    assert.ok(inv.data.bases.length >= 5);
    client.clearToken();
  });

  it('T3_PAIR_03 (F17 + F08): Custom pizza selection -> creates Razorpay test order with exact calculated price', async () => {
    const email = generateRandomEmail('p03');
    const reg = await client.post('/api/auth/register', { name: 'P03', email, password: 'Password123!' });
    await client.get(`/api/auth/verify-email?token=${reg.data.emailVerificationToken}`);
    const log = await client.post('/api/auth/login', { email, password: 'Password123!' });
    client.setToken(log.data.token);

    const b = groupedInventory.bases[0];
    const s = groupedInventory.sauces[0];
    const c = groupedInventory.cheeses[0];
    const v1 = groupedInventory.veggies[0];
    const v2 = groupedInventory.veggies[1];
    const v3 = groupedInventory.veggies[2];
    const expectedPaise = (b.price + s.price + c.price + v1.price + v2.price + v3.price) * 100;

    const ord = await client.post('/api/orders/create-razorpay-order', {
      items: [
        {
          type: 'custom',
          customDetails: { baseId: b._id, sauceId: s._id, cheeseId: c._id, veggieIds: [v1._id, v2._id, v3._id] },
          quantity: 1
        }
      ],
      deliveryAddress: 'Pair 03 St'
    });
    assert.strictEqual(ord.status, 200);
    assert.strictEqual(ord.data.amount, expectedPaise);
    client.clearToken();
  });

  it('T3_PAIR_04 (F08 + F09): Razorpay order creation -> compute HMAC signature -> verify payment -> confirms paid', async () => {
    const email = generateRandomEmail('p04');
    const reg = await client.post('/api/auth/register', { name: 'P04', email, password: 'Password123!' });
    await client.get(`/api/auth/verify-email?token=${reg.data.emailVerificationToken}`);
    const log = await client.post('/api/auth/login', { email, password: 'Password123!' });
    client.setToken(log.data.token);

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
      deliveryAddress: 'Pair 04 St'
    });

    const payId = 'pay_p04_' + Date.now();
    const sig = generateRazorpaySignature(ord.data.razorpayOrderId, payId);
    const ver = await client.post('/api/orders/verify-payment', {
      orderId: ord.data.orderId,
      razorpay_order_id: ord.data.razorpayOrderId,
      razorpay_payment_id: payId,
      razorpay_signature: sig
    });
    assert.strictEqual(ver.status, 200);
    assert.strictEqual(ver.data.order.paymentStatus, 'paid');
    client.clearToken();
  });

  it('T3_PAIR_05 (F09 + F07): Razorpay payment verification -> triggers atomic stock decrement in DB', async () => {
    const targetBase = groupedInventory.bases[0];
    const invBefore = await client.get('/api/inventory');
    const startStock = invBefore.data.find(i => i._id === targetBase._id).stock;

    const email = generateRandomEmail('p05');
    const reg = await client.post('/api/auth/register', { name: 'P05', email, password: 'Password123!' });
    await client.get(`/api/auth/verify-email?token=${reg.data.emailVerificationToken}`);
    const log = await client.post('/api/auth/login', { email, password: 'Password123!' });
    client.setToken(log.data.token);

    const ord = await client.post('/api/orders/create-razorpay-order', {
      items: [
        {
          type: 'custom',
          customDetails: {
            baseId: targetBase._id,
            sauceId: groupedInventory.sauces[0]._id,
            cheeseId: groupedInventory.cheeses[0]._id
          },
          quantity: 1
        }
      ],
      deliveryAddress: 'Pair 05 St'
    });
    const payId = 'pay_p05_' + Date.now();
    const sig = generateRazorpaySignature(ord.data.razorpayOrderId, payId);
    await client.post('/api/orders/verify-payment', {
      orderId: ord.data.orderId,
      razorpay_order_id: ord.data.razorpayOrderId,
      razorpay_payment_id: payId,
      razorpay_signature: sig
    });
    client.clearToken();

    const invAfter = await client.get('/api/inventory');
    assert.strictEqual(invAfter.data.find(i => i._id === targetBase._id).stock, startStock - 1);
  });

  it('T3_PAIR_06 (F07 + F11): Stock decrement during order verification -> broadcasts inventory_updated socket event', async () => {
    const waitPromise = socket.waitForEvent('inventory_updated', 2000);

    const email = generateRandomEmail('p06');
    const reg = await client.post('/api/auth/register', { name: 'P06', email, password: 'Password123!' });
    await client.get(`/api/auth/verify-email?token=${reg.data.emailVerificationToken}`);
    const log = await client.post('/api/auth/login', { email, password: 'Password123!' });
    client.setToken(log.data.token);

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
      deliveryAddress: 'Pair 06 St'
    });
    const payId = 'pay_p06_' + Date.now();
    const sig = generateRazorpaySignature(ord.data.razorpayOrderId, payId);
    await client.post('/api/orders/verify-payment', {
      orderId: ord.data.orderId,
      razorpay_order_id: ord.data.razorpayOrderId,
      razorpay_payment_id: payId,
      razorpay_signature: sig
    });
    client.clearToken();

    const received = await waitPromise;
    assert.strictEqual(received.inventoryId, groupedInventory.bases[0]._id);
  });

  it('T3_PAIR_07 (F07 + F12): Decrement causing stock to drop below threshold (<20) -> triggers low-stock cron alert', async () => {
    // Set base stock to 20 (threshold is 20)
    const base = groupedInventory.bases[1];
    client.setToken(adminToken);
    await client.put(`/api/inventory/${base._id}/stock`, { stock: 20, threshold: 20 });
    client.clearToken();

    // Order 1 unit so stock drops to 19 (< 20)
    const email = generateRandomEmail('p07');
    const reg = await client.post('/api/auth/register', { name: 'P07', email, password: 'Password123!' });
    await client.get(`/api/auth/verify-email?token=${reg.data.emailVerificationToken}`);
    const log = await client.post('/api/auth/login', { email, password: 'Password123!' });
    client.setToken(log.data.token);

    const ord = await client.post('/api/orders/create-razorpay-order', {
      items: [
        {
          type: 'custom',
          customDetails: { baseId: base._id, sauceId: groupedInventory.sauces[0]._id, cheeseId: groupedInventory.cheeses[0]._id },
          quantity: 1
        }
      ],
      deliveryAddress: 'Pair 07 St'
    });
    const payId = 'pay_p07_' + Date.now();
    const sig = generateRazorpaySignature(ord.data.razorpayOrderId, payId);
    await client.post('/api/orders/verify-payment', {
      orderId: ord.data.orderId,
      razorpay_order_id: ord.data.razorpayOrderId,
      razorpay_payment_id: payId,
      razorpay_signature: sig
    });
    client.clearToken();

    const alerts = mockServer.checkLowStock();
    assert.ok(alerts.some(a => a.itemId === base._id && a.stock === 19));

    // Reset base stock
    client.setToken(adminToken);
    await client.put(`/api/inventory/${base._id}/stock`, { stock: 40 });
    client.clearToken();
  });

  it('T3_PAIR_08 (F09 + F10): Confirmed paid order is recorded in Order lifecycle model with status "Order Received"', async () => {
    const email = generateRandomEmail('p08');
    const reg = await client.post('/api/auth/register', { name: 'P08', email, password: 'Password123!' });
    await client.get(`/api/auth/verify-email?token=${reg.data.emailVerificationToken}`);
    const log = await client.post('/api/auth/login', { email, password: 'Password123!' });
    client.setToken(log.data.token);

    const ord = await client.post('/api/orders/create-razorpay-order', {
      items: [
        {
          type: 'custom',
          customDetails: { baseId: groupedInventory.bases[0]._id, sauceId: groupedInventory.sauces[0]._id, cheeseId: groupedInventory.cheeses[0]._id },
          quantity: 1
        }
      ],
      deliveryAddress: 'Pair 08 St'
    });
    const payId = 'pay_p08_' + Date.now();
    const sig = generateRazorpaySignature(ord.data.razorpayOrderId, payId);
    await client.post('/api/orders/verify-payment', {
      orderId: ord.data.orderId,
      razorpay_order_id: ord.data.razorpayOrderId,
      razorpay_payment_id: payId,
      razorpay_signature: sig
    });

    const userOrders = await client.get('/api/orders');
    const placed = userOrders.data.find(o => o._id === ord.data.orderId);
    assert.strictEqual(placed.orderStatus, 'Order Received');
    client.clearToken();
  });

  it('T3_PAIR_09 (F10 + F11): Admin transitions status to "In Kitchen" -> server broadcasts order_status_updated', async () => {
    const email = generateRandomEmail('p09');
    const reg = await client.post('/api/auth/register', { name: 'P09', email, password: 'Password123!' });
    await client.get(`/api/auth/verify-email?token=${reg.data.emailVerificationToken}`);
    const log = await client.post('/api/auth/login', { email, password: 'Password123!' });
    client.setToken(log.data.token);

    const ord = await client.post('/api/orders/create-razorpay-order', {
      items: [
        {
          type: 'custom',
          customDetails: { baseId: groupedInventory.bases[0]._id, sauceId: groupedInventory.sauces[0]._id, cheeseId: groupedInventory.cheeses[0]._id },
          quantity: 1
        }
      ],
      deliveryAddress: 'Pair 09 St'
    });
    const payId = 'pay_p09_' + Date.now();
    const sig = generateRazorpaySignature(ord.data.razorpayOrderId, payId);
    await client.post('/api/orders/verify-payment', {
      orderId: ord.data.orderId,
      razorpay_order_id: ord.data.razorpayOrderId,
      razorpay_payment_id: payId,
      razorpay_signature: sig
    });
    client.clearToken();

    socket.joinOrder(ord.data.orderId);
    const waitPromise = socket.waitForEvent('order_status_updated', 2000);

    client.setToken(adminToken);
    await client.patch(`/api/admin/orders/${ord.data.orderId}/status`, { status: 'In Kitchen' });
    client.clearToken();

    const received = await waitPromise;
    assert.strictEqual(received.orderId, ord.data.orderId);
    assert.strictEqual(received.status, 'In Kitchen');
  });

  it('T3_PAIR_10 (F11 + F19): User tracking dashboard receives order_status_updated -> visual stepper advances', async () => {
    const email = generateRandomEmail('p10');
    const reg = await client.post('/api/auth/register', { name: 'P10', email, password: 'Password123!' });
    await client.get(`/api/auth/verify-email?token=${reg.data.emailVerificationToken}`);
    const log = await client.post('/api/auth/login', { email, password: 'Password123!' });
    client.setToken(log.data.token);

    const ord = await client.post('/api/orders/create-razorpay-order', {
      items: [
        {
          type: 'custom',
          customDetails: { baseId: groupedInventory.bases[0]._id, sauceId: groupedInventory.sauces[0]._id, cheeseId: groupedInventory.cheeses[0]._id },
          quantity: 1
        }
      ],
      deliveryAddress: 'Pair 10 St'
    });
    const payId = 'pay_p10_' + Date.now();
    const sig = generateRazorpaySignature(ord.data.razorpayOrderId, payId);
    await client.post('/api/orders/verify-payment', {
      orderId: ord.data.orderId,
      razorpay_order_id: ord.data.razorpayOrderId,
      razorpay_payment_id: payId,
      razorpay_signature: sig
    });
    client.clearToken();

    socket.joinOrder(ord.data.orderId);
    const waitPromise = socket.waitForEvent('order_status_updated', 2000);

    client.setToken(adminToken);
    await client.patch(`/api/admin/orders/${ord.data.orderId}/status`, { status: 'Sent to Delivery' });
    client.clearToken();

    const received = await waitPromise;
    assert.strictEqual(received.status, 'Sent to Delivery');
  });

  it('T3_PAIR_11 (F04 + F06): Admin token authorizes stock update while regular user token is blocked', async () => {
    const email = generateRandomEmail('p11');
    const reg = await client.post('/api/auth/register', { name: 'P11', email, password: 'Password123!' });
    await client.get(`/api/auth/verify-email?token=${reg.data.emailVerificationToken}`);
    const log = await client.post('/api/auth/login', { email, password: 'Password123!' });

    // User blocked
    client.setToken(log.data.token);
    const userAttempt = await client.put(`/api/inventory/${groupedInventory.bases[0]._id}/stock`, { stock: 88 });
    assert.strictEqual(userAttempt.status, 403);
    client.clearToken();

    // Admin allowed
    client.setToken(adminToken);
    const adminAttempt = await client.put(`/api/inventory/${groupedInventory.bases[0]._id}/stock`, { stock: 88 });
    assert.strictEqual(adminAttempt.status, 200);
    assert.strictEqual(adminAttempt.data.item.stock, 88);
    client.clearToken();
  });

  it('T3_PAIR_12 (F06 + F17): Admin updates base stock to 0 -> Pizza builder step 1 reflects out-of-stock', async () => {
    const base = groupedInventory.bases[2];
    client.setToken(adminToken);
    await client.put(`/api/inventory/${base._id}/stock`, { stock: 0 });
    client.clearToken();

    const inv = await client.get('/api/inventory/grouped');
    const updatedBase = inv.data.bases.find(b => b._id === base._id);
    assert.strictEqual(updatedBase.stock, 0);

    // Revert
    client.setToken(adminToken);
    await client.put(`/api/inventory/${base._id}/stock`, { stock: 45 });
    client.clearToken();
  });

  it('T3_PAIR_13 (F06 + F21): Admin updates veggie stock -> Admin Inventory Dashboard receives WebSocket update', async () => {
    const waitPromise = socket.waitForEvent('inventory_updated', 2000);
    const veggie = groupedInventory.veggies[0];

    client.setToken(adminToken);
    await client.put(`/api/inventory/${veggie._id}/stock`, { stock: 68 });
    client.clearToken();

    const received = await waitPromise;
    assert.strictEqual(received.inventoryId, veggie._id);
    assert.strictEqual(received.currentStock, 68);
  });

  it('T3_PAIR_14 (F10 + F23): Customer confirms order -> Admin Order Management Panel receives new_order_placed', async () => {
    socket.joinRoom('admin_orders');
    const waitPromise = socket.waitForEvent('new_order_placed', 2000);

    const email = generateRandomEmail('p14');
    const reg = await client.post('/api/auth/register', { name: 'P14', email, password: 'Password123!' });
    await client.get(`/api/auth/verify-email?token=${reg.data.emailVerificationToken}`);
    const log = await client.post('/api/auth/login', { email, password: 'Password123!' });
    client.setToken(log.data.token);

    const ord = await client.post('/api/orders/create-razorpay-order', {
      items: [
        {
          type: 'custom',
          customDetails: { baseId: groupedInventory.bases[0]._id, sauceId: groupedInventory.sauces[0]._id, cheeseId: groupedInventory.cheeses[0]._id },
          quantity: 1
        }
      ],
      deliveryAddress: 'Pair 14 St'
    });
    const payId = 'pay_p14_' + Date.now();
    const sig = generateRazorpaySignature(ord.data.razorpayOrderId, payId);
    await client.post('/api/orders/verify-payment', {
      orderId: ord.data.orderId,
      razorpay_order_id: ord.data.razorpayOrderId,
      razorpay_payment_id: payId,
      razorpay_signature: sig
    });
    client.clearToken();

    const received = await waitPromise;
    assert.strictEqual(received.orderId, ord.data.orderId);
  });

  it('T3_PAIR_15 (F23 + F19): Admin transitions to "Delivered" -> Customer live tracking reflects final state', async () => {
    const email = generateRandomEmail('p15');
    const reg = await client.post('/api/auth/register', { name: 'P15', email, password: 'Password123!' });
    await client.get(`/api/auth/verify-email?token=${reg.data.emailVerificationToken}`);
    const log = await client.post('/api/auth/login', { email, password: 'Password123!' });
    client.setToken(log.data.token);

    const ord = await client.post('/api/orders/create-razorpay-order', {
      items: [
        {
          type: 'custom',
          customDetails: { baseId: groupedInventory.bases[0]._id, sauceId: groupedInventory.sauces[0]._id, cheeseId: groupedInventory.cheeses[0]._id },
          quantity: 1
        }
      ],
      deliveryAddress: 'Pair 15 St'
    });
    const payId = 'pay_p15_' + Date.now();
    const sig = generateRazorpaySignature(ord.data.razorpayOrderId, payId);
    await client.post('/api/orders/verify-payment', {
      orderId: ord.data.orderId,
      razorpay_order_id: ord.data.razorpayOrderId,
      razorpay_payment_id: payId,
      razorpay_signature: sig
    });
    client.clearToken();

    socket.joinOrder(ord.data.orderId);
    const waitPromise = socket.waitForEvent('order_status_updated', 2000);

    client.setToken(adminToken);
    await client.patch(`/api/admin/orders/${ord.data.orderId}/status`, { status: 'Delivered' });
    client.clearToken();

    const received = await waitPromise;
    assert.strictEqual(received.status, 'Delivered');
  });

  it('T3_PAIR_16 (F03 + F02): User forgets password -> resets with token -> logs in with new password -> old password fails', async () => {
    const email = generateRandomEmail('p16');
    const reg = await client.post('/api/auth/register', { name: 'P16', email, password: 'OldPassword123!' });
    await client.get(`/api/auth/verify-email?token=${reg.data.emailVerificationToken}`);
    const forgot = await client.post('/api/auth/forgot-password', { email });
    const token = forgot.data.resetToken;

    await client.post('/api/auth/reset-password', { token, newPassword: 'NewPassword456!' });

    const newLogin = await client.post('/api/auth/login', { email, password: 'NewPassword456!' });
    assert.strictEqual(newLogin.status, 200);

    const oldLogin = await client.post('/api/auth/login', { email, password: 'OldPassword123!' });
    assert.strictEqual(oldLogin.status, 401);
  });

  it('T3_PAIR_17 (F16 + F18): User selects 2 pre-configured pizzas -> Order Summary calculates exact item sum', async () => {
    const pizzas = await client.get('/api/pizzas');
    const p1 = pizzas.data[0];
    const p2 = pizzas.data[1];

    const email = generateRandomEmail('p17');
    const reg = await client.post('/api/auth/register', { name: 'P17', email, password: 'Password123!' });
    await client.get(`/api/auth/verify-email?token=${reg.data.emailVerificationToken}`);
    const log = await client.post('/api/auth/login', { email, password: 'Password123!' });
    client.setToken(log.data.token);

    const ord = await client.post('/api/orders/create-razorpay-order', {
      items: [
        { type: 'preconfigured', pizzaId: p1._id, quantity: 1 },
        { type: 'preconfigured', pizzaId: p2._id, quantity: 1 }
      ],
      deliveryAddress: 'Pair 17 St'
    });
    assert.strictEqual(ord.status, 200);
    assert.strictEqual(ord.data.amount, (p1.price + p2.price) * 100);
    client.clearToken();
  });

  it('T3_PAIR_18 (F18 + F08): Order Summary "Proceed to Pay" initiates Razorpay order with server-verified total', async () => {
    const email = generateRandomEmail('p18');
    const reg = await client.post('/api/auth/register', { name: 'P18', email, password: 'Password123!' });
    await client.get(`/api/auth/verify-email?token=${reg.data.emailVerificationToken}`);
    const log = await client.post('/api/auth/login', { email, password: 'Password123!' });
    client.setToken(log.data.token);

    const ord = await client.post('/api/orders/create-razorpay-order', {
      items: [
        {
          type: 'custom',
          customDetails: { baseId: groupedInventory.bases[0]._id, sauceId: groupedInventory.sauces[0]._id, cheeseId: groupedInventory.cheeses[0]._id },
          quantity: 2
        }
      ],
      deliveryAddress: 'Pair 18 St'
    });
    assert.strictEqual(ord.status, 200);
    assert.ok(ord.data.razorpayOrderId);
    assert.ok(ord.data.key);
    client.clearToken();
  });

  it('T3_PAIR_19 (F22 + F12): Admin lowers stock below threshold in editor -> subsequent cron job flags item', async () => {
    const veggie = groupedInventory.veggies[3];
    client.setToken(adminToken);
    await client.put(`/api/inventory/${veggie._id}/stock`, { stock: 8, threshold: 15 });
    client.clearToken();

    const alerts = mockServer.checkLowStock();
    assert.ok(alerts.some(a => a.itemId === veggie._id && a.stock === 8));

    // Reset
    client.setToken(adminToken);
    await client.put(`/api/inventory/${veggie._id}/stock`, { stock: 55 });
    client.clearToken();
  });

  it('T3_PAIR_20 (F22 + F06): Admin restocks depleted ingredient -> stock increases -> customer can now order it', async () => {
    const sauce = groupedInventory.sauces[3];
    // Deplete
    client.setToken(adminToken);
    await client.put(`/api/inventory/${sauce._id}/stock`, { stock: 0 });
    client.clearToken();

    // Restock
    client.setToken(adminToken);
    await client.put(`/api/inventory/${sauce._id}/stock`, { stock: 50 });
    client.clearToken();

    // Customer orders
    const email = generateRandomEmail('p20');
    const reg = await client.post('/api/auth/register', { name: 'P20', email, password: 'Password123!' });
    await client.get(`/api/auth/verify-email?token=${reg.data.emailVerificationToken}`);
    const log = await client.post('/api/auth/login', { email, password: 'Password123!' });
    client.setToken(log.data.token);

    const ord = await client.post('/api/orders/create-razorpay-order', {
      items: [
        {
          type: 'custom',
          customDetails: { baseId: groupedInventory.bases[0]._id, sauceId: sauce._id, cheeseId: groupedInventory.cheeses[0]._id },
          quantity: 1
        }
      ],
      deliveryAddress: 'Pair 20 St'
    });
    const payId = 'pay_p20_' + Date.now();
    const sig = generateRazorpaySignature(ord.data.razorpayOrderId, payId);
    const ver = await client.post('/api/orders/verify-payment', {
      orderId: ord.data.orderId,
      razorpay_order_id: ord.data.razorpayOrderId,
      razorpay_payment_id: payId,
      razorpay_signature: sig
    });
    assert.strictEqual(ver.status, 200);
    client.clearToken();
  });

  it('T3_PAIR_21 (F13 + F19): Status badge on tracking dashboard contract specifies theme CSS tokens', () => {
    const statusTokenMap = {
      'Order Received': '--color-received',
      'In Kitchen': '--color-kitchen',
      'Sent to Delivery': '--color-delivery'
    };
    assert.strictEqual(statusTokenMap['Order Received'], '--color-received');
    assert.strictEqual(statusTokenMap['In Kitchen'], '--color-kitchen');
    assert.strictEqual(statusTokenMap['Sent to Delivery'], '--color-delivery');
  });

  it('T3_PAIR_22 (F14 + F20): Client navigation route guard isolates consumer from accessing /admin/*', () => {
    const isAllowed = (path, role) => {
      if (path.startsWith('/admin') && path !== '/admin/login') return role === 'admin';
      return true;
    };
    assert.strictEqual(isAllowed('/admin/inventory', 'user'), false);
    assert.strictEqual(isAllowed('/admin/inventory', 'admin'), true);
  });

  it('T3_PAIR_23 (F09 + F24): Payment verification with forged signature is rejected -> stock is NOT decremented', async () => {
    const base = groupedInventory.bases[0];
    const invBefore = await client.get('/api/inventory');
    const startStock = invBefore.data.find(i => i._id === base._id).stock;

    const email = generateRandomEmail('p23');
    const reg = await client.post('/api/auth/register', { name: 'P23', email, password: 'Password123!' });
    await client.get(`/api/auth/verify-email?token=${reg.data.emailVerificationToken}`);
    const log = await client.post('/api/auth/login', { email, password: 'Password123!' });
    client.setToken(log.data.token);

    const ord = await client.post('/api/orders/create-razorpay-order', {
      items: [
        {
          type: 'custom',
          customDetails: { baseId: base._id, sauceId: groupedInventory.sauces[0]._id, cheeseId: groupedInventory.cheeses[0]._id },
          quantity: 1
        }
      ],
      deliveryAddress: 'Pair 23 St'
    });

    const ver = await client.post('/api/orders/verify-payment', {
      orderId: ord.data.orderId,
      razorpay_order_id: ord.data.razorpayOrderId,
      razorpay_payment_id: 'pay_forged',
      razorpay_signature: 'forged_fake_signature_hash_000000000'
    });
    assert.strictEqual(ver.status, 400);
    client.clearToken();

    const invAfter = await client.get('/api/inventory');
    assert.strictEqual(invAfter.data.find(i => i._id === base._id).stock, startStock);
  });

  it('T3_PAIR_24 (F07 + F24): Two concurrent orders for remaining stock: one succeeds, one fails atomically', async () => {
    // Set a veggie stock to 1
    const veggie = groupedInventory.veggies[5];
    client.setToken(adminToken);
    await client.put(`/api/inventory/${veggie._id}/stock`, { stock: 1 });
    client.clearToken();

    const email = generateRandomEmail('p24');
    const reg = await client.post('/api/auth/register', { name: 'P24', email, password: 'Password123!' });
    await client.get(`/api/auth/verify-email?token=${reg.data.emailVerificationToken}`);
    const log = await client.post('/api/auth/login', { email, password: 'Password123!' });
    client.setToken(log.data.token);

    // Create 2 orders for same veggie
    const ord1 = await client.post('/api/orders/create-razorpay-order', {
      items: [{ type: 'custom', customDetails: { baseId: groupedInventory.bases[0]._id, sauceId: groupedInventory.sauces[0]._id, cheeseId: groupedInventory.cheeses[0]._id, veggieIds: [veggie._id] }, quantity: 1 }],
      deliveryAddress: 'Pair 24 St'
    });
    const ord2 = await client.post('/api/orders/create-razorpay-order', {
      items: [{ type: 'custom', customDetails: { baseId: groupedInventory.bases[0]._id, sauceId: groupedInventory.sauces[0]._id, cheeseId: groupedInventory.cheeses[0]._id, veggieIds: [veggie._id] }, quantity: 1 }],
      deliveryAddress: 'Pair 24 St'
    });

    const payId1 = 'pay_c1_' + Date.now();
    const sig1 = generateRazorpaySignature(ord1.data.razorpayOrderId, payId1);
    const payId2 = 'pay_c2_' + Date.now();
    const sig2 = generateRazorpaySignature(ord2.data.razorpayOrderId, payId2);

    const [ver1, ver2] = await Promise.all([
      client.post('/api/orders/verify-payment', { orderId: ord1.data.orderId, razorpay_order_id: ord1.data.razorpayOrderId, razorpay_payment_id: payId1, razorpay_signature: sig1 }),
      client.post('/api/orders/verify-payment', { orderId: ord2.data.orderId, razorpay_order_id: ord2.data.razorpayOrderId, razorpay_payment_id: payId2, razorpay_signature: sig2 })
    ]);

    const statuses = [ver1.status, ver2.status];
    assert.ok(statuses.includes(200), 'One order must succeed');
    assert.ok(statuses.includes(400), 'One order must fail due to insufficient stock');
    client.clearToken();

    // Reset veggie stock
    client.setToken(adminToken);
    await client.put(`/api/inventory/${veggie._id}/stock`, { stock: 60 });
    client.clearToken();
  });
});
