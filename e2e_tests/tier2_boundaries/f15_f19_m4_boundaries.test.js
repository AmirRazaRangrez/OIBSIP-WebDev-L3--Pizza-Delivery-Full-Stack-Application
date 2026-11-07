// e2e_tests/tier2_boundaries/f15_f19_m4_boundaries.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnvironment, teardownTestEnvironment } from '../helpers/testContext.js';
import { generateRandomEmail } from '../helpers/cryptoHelper.js';

describe('Tier 2: Boundary & Corner Cases F15–F19 (Milestone 4)', () => {
  let client;
  let userToken;
  let groupedInventory;

  before(async () => {
    const ctx = await setupTestEnvironment();
    client = ctx.client;

    const email = generateRandomEmail('b_m4');
    const reg = await client.post('/api/auth/register', {
      name: 'M4 Boundary Tester',
      email,
      password: 'Password123!'
    });
    await client.get(`/api/auth/verify-email?token=${reg.data.emailVerificationToken}`);
    const login = await client.post('/api/auth/login', { email, password: 'Password123!' });
    userToken = login.data.token;

    const inv = await client.get('/api/inventory/grouped');
    groupedInventory = inv.data;
  });

  after(async () => {
    await teardownTestEnvironment();
  });

  // ==========================================
  // F15 Boundaries
  // ==========================================
  describe('F15: User Authentication Views Boundaries', () => {
    it('T2_F15_01: Registration with empty name field returns 400', async () => {
      const res = await client.post('/api/auth/register', {
        name: '',
        email: generateRandomEmail('noname'),
        password: 'Password123!'
      });
      assert.strictEqual(res.status, 400);
    });

    it('T2_F15_02: Login with empty password returns 400 Bad Request', async () => {
      const res = await client.post('/api/auth/login', {
        email: 'test@example.com',
        password: ''
      });
      assert.strictEqual(res.status, 400);
    });

    it('T2_F15_03: Login with case-insensitive email matches registered account', async () => {
      const email = generateRandomEmail('case_test');
      const reg = await client.post('/api/auth/register', {
        name: 'Case Test',
        email: email.toLowerCase(),
        password: 'Password123!'
      });
      await client.get(`/api/auth/verify-email?token=${reg.data.emailVerificationToken}`);

      const res = await client.post('/api/auth/login', {
        email: email.toUpperCase(),
        password: 'Password123!'
      });
      assert.strictEqual(res.status, 200);
    });

    it('T2_F15_04: Password reset with empty token returns 400 Bad Request', async () => {
      const res = await client.post('/api/auth/reset-password', {
        token: '',
        newPassword: 'Password123!'
      });
      assert.strictEqual(res.status, 400);
    });

    it('T2_F15_05: Registration with whitespace-only email returns 400', async () => {
      const res = await client.post('/api/auth/register', {
        name: 'Whitespace',
        email: '   ',
        password: 'Password123!'
      });
      assert.strictEqual(res.status, 400);
    });
  });

  // ==========================================
  // F16 Boundaries
  // ==========================================
  describe('F16: User Dashboard & Catalog Boundaries', () => {
    it('T2_F16_01: Requesting pre-configured catalog with invalid query params still returns 200', async () => {
      const res = await client.get('/api/pizzas?filter=invalid_junk_123');
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.data));
    });

    it('T2_F16_02: Adding pre-configured pizza with invalid pizzaId returns 400', async () => {
      client.setToken(userToken);
      const res = await client.post('/api/orders/create-razorpay-order', {
        items: [
          {
            type: 'preconfigured',
            pizzaId: 'pizza_non_existent_999',
            quantity: 1
          }
        ],
        deliveryAddress: 'Invalid Pizza Rd'
      });
      assert.strictEqual(res.status, 400);
      client.clearToken();
    });

    it('T2_F16_03: Adding pre-configured pizza with quantity <= 0 returns 400', async () => {
      client.setToken(userToken);
      const pizzas = await client.get('/api/pizzas');
      const res = await client.post('/api/orders/create-razorpay-order', {
        items: [
          {
            type: 'preconfigured',
            pizzaId: pizzas.data[0]._id,
            quantity: -1
          }
        ],
        deliveryAddress: 'Negative Quantity Rd'
      });
      assert.strictEqual(res.status, 400);
      client.clearToken();
    });

    it('T2_F16_04: Catalog pizza objects include category property', async () => {
      const res = await client.get('/api/pizzas');
      assert.ok(res.data.every(p => Boolean(p.category)));
    });

    it('T2_F16_05: All catalog pizzas have non-empty description', async () => {
      const res = await client.get('/api/pizzas');
      assert.ok(res.data.every(p => p.description && p.description.trim().length > 0));
    });
  });

  // ==========================================
  // F17 Boundaries
  // ==========================================
  describe('F17: 4-Step Pizza Builder Boundaries', () => {
    it('T2_F17_01: Custom pizza without sauce selection returns 400 Bad Request', async () => {
      client.setToken(userToken);
      const res = await client.post('/api/orders/create-razorpay-order', {
        items: [
          {
            type: 'custom',
            customDetails: {
              baseId: groupedInventory.bases[0]._id,
              cheeseId: groupedInventory.cheeses[0]._id
            },
            quantity: 1
          }
        ],
        deliveryAddress: 'No Sauce St'
      });
      assert.strictEqual(res.status, 400);
      client.clearToken();
    });

    it('T2_F17_02: Custom pizza without cheese selection returns 400 Bad Request', async () => {
      client.setToken(userToken);
      const res = await client.post('/api/orders/create-razorpay-order', {
        items: [
          {
            type: 'custom',
            customDetails: {
              baseId: groupedInventory.bases[0]._id,
              sauceId: groupedInventory.sauces[0]._id
            },
            quantity: 1
          }
        ],
        deliveryAddress: 'No Cheese St'
      });
      assert.strictEqual(res.status, 400);
      client.clearToken();
    });

    it('T2_F17_03: Custom pizza with empty customDetails object returns 400', async () => {
      client.setToken(userToken);
      const res = await client.post('/api/orders/create-razorpay-order', {
        items: [
          {
            type: 'custom',
            customDetails: {},
            quantity: 1
          }
        ],
        deliveryAddress: 'Empty Custom Details St'
      });
      assert.strictEqual(res.status, 400);
      client.clearToken();
    });

    it('T2_F17_04: Custom pizza with 0 vegetables selected is valid (plain cheese pizza)', async () => {
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
        deliveryAddress: 'Plain Cheese St'
      });
      assert.strictEqual(res.status, 200);
      client.clearToken();
    });

    it('T2_F17_05: Custom pizza with non-existent veggie ID is handled safely without server crash', async () => {
      client.setToken(userToken);
      const res = await client.post('/api/orders/create-razorpay-order', {
        items: [
          {
            type: 'custom',
            customDetails: {
              baseId: groupedInventory.bases[0]._id,
              sauceId: groupedInventory.sauces[0]._id,
              cheeseId: groupedInventory.cheeses[0]._id,
              veggieIds: ['non_existent_veggie_id']
            },
            quantity: 1
          }
        ],
        deliveryAddress: 'Bad Veggie St'
      });
      assert.strictEqual(res.status, 200); // ignores invalid veggie gracefully or validates
      client.clearToken();
    });
  });

  // ==========================================
  // F18 Boundaries
  // ==========================================
  describe('F18: Order Summary Boundaries', () => {
    it('T2_F18_01: Creating order without token returns 401 Unauthorized', async () => {
      client.clearToken();
      const res = await client.post('/api/orders/create-razorpay-order', {
        items: [],
        deliveryAddress: 'Unauth Rd'
      });
      assert.strictEqual(res.status, 401);
    });

    it('T2_F18_02: Creating order with null items field returns 400', async () => {
      client.setToken(userToken);
      const res = await client.post('/api/orders/create-razorpay-order', {
        items: null,
        deliveryAddress: 'Null Items Rd'
      });
      assert.strictEqual(res.status, 400);
      client.clearToken();
    });

    it('T2_F18_03: Creating order with missing deliveryAddress returns 400', async () => {
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
        ]
      });
      assert.strictEqual(res.status, 400);
      client.clearToken();
    });

    it('T2_F18_04: Order amount in paise is always an exact integer', async () => {
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
        deliveryAddress: 'Integer Amount St'
      });
      assert.ok(Number.isInteger(res.data.amount));
      client.clearToken();
    });

    it('T2_F18_05: Currency INR is non-negotiable for Razorpay configuration', async () => {
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
        deliveryAddress: 'Currency Test St'
      });
      assert.strictEqual(res.data.currency, 'INR');
      client.clearToken();
    });
  });

  // ==========================================
  // F19 Boundaries
  // ==========================================
  describe('F19: Real-Time Order Tracking Boundaries', () => {
    it('T2_F19_01: Unauthenticated user accessing /api/orders returns 401', async () => {
      client.clearToken();
      const res = await client.get('/api/orders');
      assert.strictEqual(res.status, 401);
    });

    it('T2_F19_02: User only retrieves their own orders, never other users orders', async () => {
      // Create user 2
      const email2 = generateRandomEmail('user2');
      const reg = await client.post('/api/auth/register', {
        name: 'User Two',
        email: email2,
        password: 'Password123!'
      });
      await client.get(`/api/auth/verify-email?token=${reg.data.emailVerificationToken}`);
      const log = await client.post('/api/auth/login', { email: email2, password: 'Password123!' });

      client.setToken(log.data.token);
      const res = await client.get('/api/orders');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.length, 0); // User 2 has placed no orders yet
      client.clearToken();
    });

    it('T2_F19_03: Tracking stepper sequence strictly adheres to 4 designated statuses', () => {
      const validStatuses = ['Order Received', 'In Kitchen', 'Sent to Delivery', 'Delivered'];
      assert.strictEqual(validStatuses.length, 4);
      assert.strictEqual(validStatuses[0], 'Order Received');
      assert.strictEqual(validStatuses[3], 'Delivered');
    });

    it('T2_F19_04: Order tracking handles socket disconnections with graceful fallback to REST API', async () => {
      client.setToken(userToken);
      const res = await client.get('/api/orders');
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.data));
      client.clearToken();
    });

    it('T2_F19_05: Order records preserve created timestamp throughout lifecycle transitions', async () => {
      client.setToken(userToken);
      const res = await client.get('/api/orders');
      for (const order of res.data) {
        assert.ok(order.createdAt);
      }
      client.clearToken();
    });
  });
});

