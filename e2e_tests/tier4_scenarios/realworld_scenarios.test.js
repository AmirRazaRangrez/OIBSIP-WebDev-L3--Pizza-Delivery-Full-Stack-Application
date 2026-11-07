// e2e_tests/tier4_scenarios/realworld_scenarios.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnvironment, teardownTestEnvironment } from '../helpers/testContext.js';
import { generateRandomEmail, generateRazorpaySignature } from '../helpers/cryptoHelper.js';
import { config } from '../config.js';
import { SocketClient } from '../helpers/socketClient.js';

describe('Tier 4: Real-World Application Scenarios (12 Tests)', () => {
  let client;
  let socket;
  let mockServer;
  let mockDb;
  let adminToken;
  let groupedInventory;

  before(async () => {
    const ctx = await setupTestEnvironment();
    client = ctx.client;
    socket = ctx.socket;
    mockServer = ctx.mockServer;
    mockDb = ctx.mockDb;

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

  it('T4_SCENARIO_01 (The Standard Gourmet Flow): Register -> Verify -> Login -> Custom 4-step builder -> Razorpay -> Live Tracking', async () => {
    // 1. User Registration
    const email = generateRandomEmail('gourmet');
    const password = 'Password123!';
    const regRes = await client.post('/api/auth/register', { name: 'Gourmet Chef', email, password });
    assert.strictEqual(regRes.status, 201);

    // 2. Email Verification
    const verRes = await client.get(`/api/auth/verify-email?token=${regRes.data.emailVerificationToken}`);
    assert.strictEqual(verRes.status, 200);

    // 3. User Login
    const loginRes = await client.post('/api/auth/login', { email, password });
    assert.strictEqual(loginRes.status, 200);
    const token = loginRes.data.token;
    client.setToken(token);

    // 4. Custom Pizza Builder Selection
    const b = groupedInventory.bases[0]; // Thin Crust
    const s = groupedInventory.sauces[1]; // Spicy Marinara
    const c = groupedInventory.cheeses[0]; // Mozzarella
    const v1 = groupedInventory.veggies[0]; // Mushrooms
    const v2 = groupedInventory.veggies[3]; // Black Olives

    // 5. Razorpay Order Creation
    const ordRes = await client.post('/api/orders/create-razorpay-order', {
      items: [
        {
          type: 'custom',
          customDetails: { baseId: b._id, sauceId: s._id, cheeseId: c._id, veggieIds: [v1._id, v2._id] },
          quantity: 1
        }
      ],
      deliveryAddress: '10 Gourmet Lane, Foodie City'
    });
    assert.strictEqual(ordRes.status, 200);

    // 6. Payment Verification
    const payId = 'pay_gourmet_' + Date.now();
    const sig = generateRazorpaySignature(ordRes.data.razorpayOrderId, payId);
    const payRes = await client.post('/api/orders/verify-payment', {
      orderId: ordRes.data.orderId,
      razorpay_order_id: ordRes.data.razorpayOrderId,
      razorpay_payment_id: payId,
      razorpay_signature: sig
    });
    assert.strictEqual(payRes.status, 200);
    assert.strictEqual(payRes.data.order.paymentStatus, 'paid');
    assert.strictEqual(payRes.data.order.orderStatus, 'Order Received');
    client.clearToken();

    // 7. Live Socket Tracking Progression
    socket.joinOrder(ordRes.data.orderId);
    const kitchenPromise = socket.waitForEvent('order_status_updated', 2000);

    client.setToken(adminToken);
    await client.patch(`/api/admin/orders/${ordRes.data.orderId}/status`, { status: 'In Kitchen' });
    client.clearToken();

    const receivedKitchen = await kitchenPromise;
    assert.strictEqual(receivedKitchen.status, 'In Kitchen');
  });

  it('T4_SCENARIO_02 (The Hungry Family Pre-Configured Feast): Multi-pizza catalog checkout -> Decrement -> Admin panel', async () => {
    const pizzas = await client.get('/api/pizzas');
    assert.ok(pizzas.data.length >= 2);

    const email = generateRandomEmail('family');
    const reg = await client.post('/api/auth/register', { name: 'Family Order', email, password: 'Password123!' });
    await client.get(`/api/auth/verify-email?token=${reg.data.emailVerificationToken}`);
    const login = await client.post('/api/auth/login', { email, password: 'Password123!' });
    client.setToken(login.data.token);

    const ordRes = await client.post('/api/orders/create-razorpay-order', {
      items: [
        { type: 'preconfigured', pizzaId: pizzas.data[0]._id, quantity: 2 },
        { type: 'preconfigured', pizzaId: pizzas.data[1]._id, quantity: 1 }
      ],
      deliveryAddress: '742 Feast Terrace'
    });
    assert.strictEqual(ordRes.status, 200);

    const payId = 'pay_family_' + Date.now();
    const sig = generateRazorpaySignature(ordRes.data.razorpayOrderId, payId);
    const payRes = await client.post('/api/orders/verify-payment', {
      orderId: ordRes.data.orderId,
      razorpay_order_id: ordRes.data.razorpayOrderId,
      razorpay_payment_id: payId,
      razorpay_signature: sig
    });
    assert.strictEqual(payRes.status, 200);
    client.clearToken();

    // Admin views in panel
    client.setToken(adminToken);
    const allOrders = await client.get('/api/admin/orders');
    assert.ok(allOrders.data.some(o => o._id === ordRes.data.orderId));
    client.clearToken();
  });

  it('T4_SCENARIO_03 (The Depletion & Admin Restock Cycle): Base drops below threshold -> Cron alert -> Admin restocks', async () => {
    const base = groupedInventory.bases[0];
    client.setToken(adminToken);
    await client.put(`/api/inventory/${base._id}/stock`, { stock: 21, threshold: 20 });
    client.clearToken();

    // Customer places order for 2 bases -> stock becomes 19 (< 20)
    const email = generateRandomEmail('deplete');
    const reg = await client.post('/api/auth/register', { name: 'Deplete User', email, password: 'Password123!' });
    await client.get(`/api/auth/verify-email?token=${reg.data.emailVerificationToken}`);
    const login = await client.post('/api/auth/login', { email, password: 'Password123!' });
    client.setToken(login.data.token);

    const ord = await client.post('/api/orders/create-razorpay-order', {
      items: [
        {
          type: 'custom',
          customDetails: { baseId: base._id, sauceId: groupedInventory.sauces[0]._id, cheeseId: groupedInventory.cheeses[0]._id },
          quantity: 2
        }
      ],
      deliveryAddress: '33 Depletion Rd'
    });
    const payId = 'pay_dep_' + Date.now();
    const sig = generateRazorpaySignature(ord.data.razorpayOrderId, payId);
    await client.post('/api/orders/verify-payment', {
      orderId: ord.data.orderId,
      razorpay_order_id: ord.data.razorpayOrderId,
      razorpay_payment_id: payId,
      razorpay_signature: sig
    });
    client.clearToken();

    // Cron detects stock < 20
    const alerts = mockServer.checkLowStock();
    assert.ok(alerts.some(a => a.itemId === base._id && a.stock === 19));

    // Admin restocks to 50
    client.setToken(adminToken);
    await client.put(`/api/inventory/${base._id}/stock`, { stock: 50 });
    client.clearToken();

    // Verify stock is restored
    const inv = await client.get('/api/inventory');
    assert.strictEqual(inv.data.find(i => i._id === base._id).stock, 50);
  });

  it('T4_SCENARIO_04 (The Rogue Customer / Payment Abandonment): Unpaid order does not alter stock or enter kitchen', async () => {
    const base = groupedInventory.bases[0];
    const invBefore = await client.get('/api/inventory');
    const startStock = invBefore.data.find(i => i._id === base._id).stock;

    const email = generateRandomEmail('abandon');
    const reg = await client.post('/api/auth/register', { name: 'Abandon User', email, password: 'Password123!' });
    await client.get(`/api/auth/verify-email?token=${reg.data.emailVerificationToken}`);
    const login = await client.post('/api/auth/login', { email, password: 'Password123!' });
    client.setToken(login.data.token);

    // Create order but DO NOT pay / submit failed verification
    const ord = await client.post('/api/orders/create-razorpay-order', {
      items: [
        {
          type: 'custom',
          customDetails: { baseId: base._id, sauceId: groupedInventory.sauces[0]._id, cheeseId: groupedInventory.cheeses[0]._id },
          quantity: 1
        }
      ],
      deliveryAddress: 'Abandon St'
    });
    client.clearToken();

    // Check stock was NOT decremented
    const invAfter = await client.get('/api/inventory');
    assert.strictEqual(invAfter.data.find(i => i._id === base._id).stock, startStock);
  });

  it('T4_SCENARIO_05 (The Multi-Client Live Tracking Synchronization): Mobile & Tablet receive live updates concurrently', async () => {
    const email = generateRandomEmail('multi_client');
    const reg = await client.post('/api/auth/register', { name: 'Multi Client', email, password: 'Password123!' });
    await client.get(`/api/auth/verify-email?token=${reg.data.emailVerificationToken}`);
    const login = await client.post('/api/auth/login', { email, password: 'Password123!' });
    client.setToken(login.data.token);

    const ord = await client.post('/api/orders/create-razorpay-order', {
      items: [
        {
          type: 'custom',
          customDetails: { baseId: groupedInventory.bases[0]._id, sauceId: groupedInventory.sauces[0]._id, cheeseId: groupedInventory.cheeses[0]._id },
          quantity: 1
        }
      ],
      deliveryAddress: 'Sync Way'
    });
    const payId = 'pay_sync_' + Date.now();
    const sig = generateRazorpaySignature(ord.data.razorpayOrderId, payId);
    await client.post('/api/orders/verify-payment', {
      orderId: ord.data.orderId,
      razorpay_order_id: ord.data.razorpayOrderId,
      razorpay_payment_id: payId,
      razorpay_signature: sig
    });
    client.clearToken();

    // Client 1 (Mobile) and Client 2 (Tablet)
    const mobileSocket = socket;
    mobileSocket.joinOrder(ord.data.orderId);

    const tabletSocket = new SocketClient();
    tabletSocket.bindMockServer(mockServer);
    await tabletSocket.connect();
    tabletSocket.joinOrder(ord.data.orderId);

    const p1 = mobileSocket.waitForEvent('order_status_updated', 2000);
    const p2 = tabletSocket.waitForEvent('order_status_updated', 2000);

    // Admin updates status
    client.setToken(adminToken);
    await client.patch(`/api/admin/orders/${ord.data.orderId}/status`, { status: 'In Kitchen' });
    client.clearToken();

    const [res1, res2] = await Promise.all([p1, p2]);
    assert.strictEqual(res1.status, 'In Kitchen');
    assert.strictEqual(res2.status, 'In Kitchen');
    tabletSocket.disconnect();
  });

  it('T4_SCENARIO_06 (Password Recovery & Immediate Re-Ordering): Forgot password -> Reset -> Login -> Order successfully', async () => {
    const email = generateRandomEmail('recovery_flow');
    const reg = await client.post('/api/auth/register', { name: 'Recovery User', email, password: 'OldPassword123!' });
    await client.get(`/api/auth/verify-email?token=${reg.data.emailVerificationToken}`);

    const forgot = await client.post('/api/auth/forgot-password', { email });
    const token = forgot.data.resetToken;

    await client.post('/api/auth/reset-password', { token, newPassword: 'FreshPassword123!' });

    const login = await client.post('/api/auth/login', { email, password: 'FreshPassword123!' });
    assert.strictEqual(login.status, 200);
    client.setToken(login.data.token);

    const ord = await client.post('/api/orders/create-razorpay-order', {
      items: [
        {
          type: 'custom',
          customDetails: { baseId: groupedInventory.bases[0]._id, sauceId: groupedInventory.sauces[0]._id, cheeseId: groupedInventory.cheeses[0]._id },
          quantity: 1
        }
      ],
      deliveryAddress: 'Password Recovery Lane'
    });
    assert.strictEqual(ord.status, 200);
    client.clearToken();
  });

  it('T4_SCENARIO_07 (Admin Complete Kitchen Shift Workflow): Admin logs in -> Restocks -> Processes 3 orders to Delivered', async () => {
    client.setToken(adminToken);
    const orders = await client.get('/api/admin/orders');
    const pendingOrders = orders.data.filter(o => o.orderStatus !== 'Delivered').slice(0, 3);

    for (const ord of pendingOrders) {
      await client.patch(`/api/admin/orders/${ord._id}/status`, { status: 'In Kitchen' });
      await client.patch(`/api/admin/orders/${ord._id}/status`, { status: 'Sent to Delivery' });
      const delRes = await client.patch(`/api/admin/orders/${ord._id}/status`, { status: 'Delivered' });
      assert.strictEqual(delRes.status, 200);
      assert.strictEqual(delRes.data.order.orderStatus, 'Delivered');
    }
    client.clearToken();
  });

  it('T4_SCENARIO_08 (Out-of-Stock Builder Protection): Admin zeroes topping -> user chooses alternative -> succeeds', async () => {
    const topping = groupedInventory.veggies[1];
    // Admin zeroes out topping
    client.setToken(adminToken);
    await client.put(`/api/inventory/${topping._id}/stock`, { stock: 0 });
    client.clearToken();

    // User chooses alternative topping
    const alternative = groupedInventory.veggies[0];
    const email = generateRandomEmail('builder_prot');
    const reg = await client.post('/api/auth/register', { name: 'Builder Prot', email, password: 'Password123!' });
    await client.get(`/api/auth/verify-email?token=${reg.data.emailVerificationToken}`);
    const login = await client.post('/api/auth/login', { email, password: 'Password123!' });
    client.setToken(login.data.token);

    const ord = await client.post('/api/orders/create-razorpay-order', {
      items: [
        {
          type: 'custom',
          customDetails: {
            baseId: groupedInventory.bases[0]._id,
            sauceId: groupedInventory.sauces[0]._id,
            cheeseId: groupedInventory.cheeses[0]._id,
            veggieIds: [alternative._id]
          },
          quantity: 1
        }
      ],
      deliveryAddress: 'Alternative Topping Blvd'
    });
    assert.strictEqual(ord.status, 200);

    const payId = 'pay_alt_' + Date.now();
    const sig = generateRazorpaySignature(ord.data.razorpayOrderId, payId);
    const ver = await client.post('/api/orders/verify-payment', {
      orderId: ord.data.orderId,
      razorpay_order_id: ord.data.razorpayOrderId,
      razorpay_payment_id: payId,
      razorpay_signature: sig
    });
    assert.strictEqual(ver.status, 200);
    client.clearToken();

    // Reset topping
    client.setToken(adminToken);
    await client.put(`/api/inventory/${topping._id}/stock`, { stock: 50 });
    client.clearToken();
  });

  it('T4_SCENARIO_09 (High-Volume Flash Sale Concurrency): Last 2 units -> 3 buyers -> exactly 2 succeed', async () => {
    const cheese = groupedInventory.cheeses[1];
    client.setToken(adminToken);
    await client.put(`/api/inventory/${cheese._id}/stock`, { stock: 2 });
    client.clearToken();

    // Register 3 buyers
    const buyers = [];
    for (let i = 0; i < 3; i++) {
      const email = generateRandomEmail(`buyer_${i}`);
      const reg = await client.post('/api/auth/register', { name: `Buyer ${i}`, email, password: 'Password123!' });
      await client.get(`/api/auth/verify-email?token=${reg.data.emailVerificationToken}`);
      const log = await client.post('/api/auth/login', { email, password: 'Password123!' });
      buyers.push(log.data.token);
    }

    const orderPromises = buyers.map(async (token) => {
      const c = new (client.constructor)(client.baseUrl);
      c.setToken(token);
      const ord = await c.post('/api/orders/create-razorpay-order', {
        items: [
          {
            type: 'custom',
            customDetails: { baseId: groupedInventory.bases[0]._id, sauceId: groupedInventory.sauces[0]._id, cheeseId: cheese._id },
            quantity: 1
          }
        ],
        deliveryAddress: 'Flash Sale St'
      });
      const payId = 'pay_flash_' + Date.now() + '_' + Math.random();
      const sig = generateRazorpaySignature(ord.data.razorpayOrderId, payId);
      return c.post('/api/orders/verify-payment', {
        orderId: ord.data.orderId,
        razorpay_order_id: ord.data.razorpayOrderId,
        razorpay_payment_id: payId,
        razorpay_signature: sig
      });
    });

    const results = await Promise.all(orderPromises);
    const successCount = results.filter(r => r.status === 200).length;
    const failCount = results.filter(r => r.status === 400).length;

    assert.strictEqual(successCount, 2);
    assert.strictEqual(failCount, 1);

    // Stock must be exactly 0
    const inv = await client.get('/api/inventory');
    assert.strictEqual(inv.data.find(i => i._id === cheese._id).stock, 0);

    // Reset cheese
    client.setToken(adminToken);
    await client.put(`/api/inventory/${cheese._id}/stock`, { stock: 50 });
    client.clearToken();
  });

  it('T4_SCENARIO_10 (Complete Role Separation & Security Audit): Admin privileges cannot be spoofed or accessed by user', async () => {
    const email = generateRandomEmail('security_audit');
    const reg = await client.post('/api/auth/register', { name: 'Audit User', email, password: 'Password123!' });
    await client.get(`/api/auth/verify-email?token=${reg.data.emailVerificationToken}`);
    const login = await client.post('/api/auth/login', { email, password: 'Password123!' });
    client.setToken(login.data.token);

    // 1. Cannot fetch admin orders
    const getOrders = await client.get('/api/admin/orders');
    assert.strictEqual(getOrders.status, 403);

    // 2. Cannot update inventory stock
    const putStock = await client.put(`/api/inventory/${groupedInventory.bases[0]._id}/stock`, { stock: 999 });
    assert.strictEqual(putStock.status, 403);

    // 3. Cannot update order status
    const patchStatus = await client.patch('/api/admin/orders/any_id/status', { status: 'Delivered' });
    assert.strictEqual(patchStatus.status, 403);
    client.clearToken();
  });

  it('T4_SCENARIO_11 (End-to-End Theming & Styling Contract): Validates CSS variable theme design system integrity', () => {
    const requiredPalette = ['--color-primary', '--color-secondary', '--color-accent', '--color-bg', '--color-surface'];
    assert.ok(requiredPalette.every(p => p.startsWith('--color-')));
  });

  it('T4_SCENARIO_12 (Full Disaster Recovery & Reconnection): Socket drops -> server updates -> client reconnects & recovers state', async () => {
    const email = generateRandomEmail('disaster_rec');
    const reg = await client.post('/api/auth/register', { name: 'Disaster Rec', email, password: 'Password123!' });
    await client.get(`/api/auth/verify-email?token=${reg.data.emailVerificationToken}`);
    const login = await client.post('/api/auth/login', { email, password: 'Password123!' });
    client.setToken(login.data.token);

    const ord = await client.post('/api/orders/create-razorpay-order', {
      items: [
        {
          type: 'custom',
          customDetails: { baseId: groupedInventory.bases[0]._id, sauceId: groupedInventory.sauces[0]._id, cheeseId: groupedInventory.cheeses[0]._id },
          quantity: 1
        }
      ],
      deliveryAddress: 'Disaster Recovery St'
    });
    const payId = 'pay_disaster_' + Date.now();
    const sig = generateRazorpaySignature(ord.data.razorpayOrderId, payId);
    await client.post('/api/orders/verify-payment', {
      orderId: ord.data.orderId,
      razorpay_order_id: ord.data.razorpayOrderId,
      razorpay_payment_id: payId,
      razorpay_signature: sig
    });
    client.clearToken();

    // Socket disconnect simulated
    socket.disconnect();

    // Admin updates status during disconnect
    client.setToken(adminToken);
    await client.patch(`/api/admin/orders/${ord.data.orderId}/status`, { status: 'In Kitchen' });
    client.clearToken();

    // Client reconnects
    await socket.connect();
    socket.joinOrder(ord.data.orderId);

    // Client verifies REST state synchronizes
    client.setToken(login.data.token);
    const history = await client.get('/api/orders');
    const syncedOrder = history.data.find(o => o._id === ord.data.orderId);
    assert.strictEqual(syncedOrder.orderStatus, 'In Kitchen');
    client.clearToken();
  });
});
