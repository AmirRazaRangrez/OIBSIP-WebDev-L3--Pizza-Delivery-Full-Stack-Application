// e2e_tests/tier1_features/f24_m6.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnvironment, teardownTestEnvironment } from '../helpers/testContext.js';
import { generateRandomEmail, generateRazorpaySignature } from '../helpers/cryptoHelper.js';

describe('Tier 1: Feature F24 (Milestone 6)', () => {
  let client;
  let userToken;
  let groupedInventory;

  before(async () => {
    const ctx = await setupTestEnvironment();
    client = ctx.client;

    const email = generateRandomEmail('f24_user');
    const reg = await client.post('/api/auth/register', { name: 'F24 User', email, password: 'Password123!' });
    await client.get(`/api/auth/verify-email?token=${reg.data.emailVerificationToken}`);
    const log = await client.post('/api/auth/login', { email, password: 'Password123!' });
    userToken = log.data.token;

    const inv = await client.get('/api/inventory/grouped');
    groupedInventory = inv.data;
  });

  after(async () => {
    await teardownTestEnvironment();
  });

  // ==========================================
  // F24: E2E Test Suite Pass & Hardening
  // ==========================================
  describe('F24: E2E Test Suite Pass & Hardening', () => {
    it('T1_F24_01: High throughput request handling executes without connection drops', async () => {
      const requests = Array.from({ length: 10 }, () => client.get('/api/inventory'));
      const responses = await Promise.all(requests);
      assert.ok(responses.every(r => r.status === 200));
    });

    it('T1_F24_02: Multiple concurrent user registrations execute without race conditions', async () => {
      const users = Array.from({ length: 5 }, (_, i) => ({
        name: `Concurrent User ${i}`,
        email: generateRandomEmail(`conc_${i}`),
        password: 'Password123!'
      }));

      const responses = await Promise.all(users.map(u => client.post('/api/auth/register', u)));
      assert.ok(responses.every(r => r.status === 201));
    });

    it('T1_F24_03: Tampered payment signatures are deterministically rejected with 400', async () => {
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
        deliveryAddress: 'Tamper St'
      });

      const res = await client.post('/api/orders/verify-payment', {
        orderId: ord.data.orderId,
        razorpay_order_id: ord.data.razorpayOrderId,
        razorpay_payment_id: 'pay_tamper',
        razorpay_signature: 'invalid_forged_signature_hex_1234567890'
      });
      assert.strictEqual(res.status, 400);
      client.clearToken();
    });

    it('T1_F24_04: Injection payloads in authentication inputs fail safely', async () => {
      const injectionRes = await client.post('/api/auth/login', {
        email: { $ne: null },
        password: { $gt: '' }
      });
      assert.ok(injectionRes.status === 400 || injectionRes.status === 401);
    });

    it('T1_F24_05: Malformed JSON body returns 400 Bad Request without stack trace leakage', async () => {
      const res = await client.request('POST', '/api/auth/login', 'not-valid-json{broken');
      assert.strictEqual(res.status, 400);
      assert.ok(!res.rawText.includes('at Module._compile'));
    });
  });
});

