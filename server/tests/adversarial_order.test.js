const request = require('supertest');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

// Mock Razorpay SDK
jest.mock('razorpay', () => {
  return jest.fn().mockImplementation(() => ({
    orders: {
      create: jest.fn().mockImplementation(async (params) => ({
        id: 'order_rzp_mock_' + Math.random().toString(36).substring(7),
        entity: 'order',
        amount: params.amount,
        amount_paid: 0,
        amount_due: params.amount,
        currency: params.currency || 'INR',
        receipt: params.receipt,
        status: 'created',
        created_at: Math.floor(Date.now() / 1000)
      }))
    }
  }));
});

const app = require('../server');
const User = require('../models/User');
const Inventory = require('../models/Inventory');
const Order = require('../models/Order');

describe('Adversarial Order & Payment Stress Suite (M2)', () => {
  let customerAToken;
  let customerBToken;
  let adminToken;
  let customerA;
  let customerB;
  let adminUser;
  let base;
  let sauce;
  let cheese;

  const generateToken = (user) => {
    return jwt.sign(
      { id: user._id.toString(), role: user.role },
      process.env.JWT_SECRET || 'test_jwt_secret_key_12345',
      { expiresIn: '1h' }
    );
  };

  const generateSignature = (orderId, paymentId) => {
    const secret = process.env.RAZORPAY_KEY_SECRET || 'FXnUylflZOnGsE4zoexrkIuv';
    return crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
  };

  beforeEach(async () => {
    customerA = await User.create({
      name: 'Customer A',
      email: 'customerA@example.com',
      password: 'Password123!',
      role: 'user',
      isVerified: true
    });
    customerAToken = generateToken(customerA);

    customerB = await User.create({
      name: 'Customer B',
      email: 'customerB@example.com',
      password: 'Password123!',
      role: 'user',
      isVerified: true
    });
    customerBToken = generateToken(customerB);

    adminUser = await User.create({
      name: 'Admin User',
      email: 'admin@pizzadelivery.com',
      password: 'AdminPassword123!',
      role: 'admin',
      isVerified: true
    });
    adminToken = generateToken(adminUser);

    base = await Inventory.create({
      name: 'Adversarial Base',
      category: 'base',
      price: 100,
      stock: 10,
      threshold: 5
    });

    sauce = await Inventory.create({
      name: 'Adversarial Sauce',
      category: 'sauce',
      price: 50,
      stock: 10,
      threshold: 5
    });

    cheese = await Inventory.create({
      name: 'Adversarial Cheese',
      category: 'cheese',
      price: 100,
      stock: 10,
      threshold: 5
    });
  });

  describe('Dimension 1: Client Price & Parameter Tampering', () => {
    it('ADV_ORD_01: Server strictly ignores client-injected totalAmount', async () => {
      // Real price: 100 + 50 + 100 = 250 -> 25000 paise
      // Attacker tries to inject totalAmount: 1
      const res = await request(app)
        .post('/api/orders/create-razorpay-order')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({
          items: [
            {
              type: 'custom',
              customDetails: {
                baseId: base._id,
                sauceId: sauce._id,
                cheeseId: cheese._id
              },
              quantity: 1,
              price: 1,
              subtotal: 1
            }
          ],
          totalAmount: 1,
          amount: 100,
          deliveryAddress: 'Tamper St'
        });

      expect(res.status).toBe(200);
      expect(res.body.amount).toBe(25000); // 250 * 100

      const orderInDb = await Order.findById(res.body.orderId);
      expect(orderInDb.totalAmount).toBe(250);
    });

    it('ADV_ORD_02: Server ignores client-injected unit prices', async () => {
      const res = await request(app)
        .post('/api/orders/create-razorpay-order')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({
          items: [
            {
              type: 'custom',
              customDetails: {
                baseId: base._id,
                sauceId: sauce._id,
                cheeseId: cheese._id,
                price: 0
              },
              quantity: 1
            }
          ],
          deliveryAddress: 'Zero Price St'
        });

      expect(res.status).toBe(200);
      expect(res.body.amount).toBe(25000);
    });

    it('ADV_ORD_03: Rejects negative quantity exploits with 400', async () => {
      const res = await request(app)
        .post('/api/orders/create-razorpay-order')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({
          items: [
            {
              type: 'custom',
              customDetails: {
                baseId: base._id,
                sauceId: sauce._id,
                cheeseId: cheese._id
              },
              quantity: -5
            }
          ],
          deliveryAddress: 'Negative Qty St'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/quantity/i);
    });

    it('ADV_ORD_04: Rejects floating point quantities with 400', async () => {
      const res = await request(app)
        .post('/api/orders/create-razorpay-order')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({
          items: [
            {
              type: 'custom',
              customDetails: {
                baseId: base._id,
                sauceId: sauce._id,
                cheeseId: cheese._id
              },
              quantity: 1.5
            }
          ],
          deliveryAddress: 'Float Qty St'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/quantity/i);
    });
  });

  describe('Dimension 2: Cryptographic Signature Forgery & Tampering', () => {
    let order;

    beforeEach(async () => {
      const createRes = await request(app)
        .post('/api/orders/create-razorpay-order')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({
          items: [
            {
              type: 'custom',
              customDetails: {
                baseId: base._id,
                sauceId: sauce._id,
                cheeseId: cheese._id
              },
              quantity: 1
            }
          ],
          deliveryAddress: 'Crypto St'
        });
      order = createRes.body;
    });

    it('ADV_ORD_05: Cryptographic signature bit-flip forgery rejected with 400', async () => {
      const genuineSig = generateSignature(order.razorpayOrderId, 'pay_123');
      // Flip last character
      const tamperedSig = genuineSig.slice(0, -1) + (genuineSig.slice(-1) === 'a' ? 'b' : 'a');

      const res = await request(app)
        .post('/api/orders/verify-payment')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({
          orderId: order.orderId,
          razorpay_order_id: order.razorpayOrderId,
          razorpay_payment_id: 'pay_123',
          razorpay_signature: tamperedSig
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/signature/i);
    });

    it('ADV_ORD_06: Signature reuse across orders rejected with 400', async () => {
      // Create a second order
      const createRes2 = await request(app)
        .post('/api/orders/create-razorpay-order')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({
          items: [
            {
              type: 'custom',
              customDetails: {
                baseId: base._id,
                sauceId: sauce._id,
                cheeseId: cheese._id
              },
              quantity: 1
            }
          ],
          deliveryAddress: 'Crypto St 2'
        });
      const order2 = createRes2.body;

      // Valid signature for order 1
      const sigOrder1 = generateSignature(order.razorpayOrderId, 'pay_common_123');

      // Attempt to submit order 1's signature on order 2
      const res = await request(app)
        .post('/api/orders/verify-payment')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({
          orderId: order2.orderId,
          razorpay_order_id: order2.razorpayOrderId,
          razorpay_payment_id: 'pay_common_123',
          razorpay_signature: sigOrder1
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/signature/i);
    });

    it('ADV_ORD_07: Truncated / empty signature injection returns 400', async () => {
      const res = await request(app)
        .post('/api/orders/verify-payment')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({
          orderId: order.orderId,
          razorpay_order_id: order.razorpayOrderId,
          razorpay_payment_id: 'pay_123',
          razorpay_signature: ''
        });

      expect(res.status).toBe(400);
    });
  });

  describe('Dimension 3: Concurrency Race Conditions & Atomic Integrity', () => {
    it('ADV_ORD_08: Concurrency stock exhaustion: exactly 1 succeeds, 1 fails, stock ends at 0', async () => {
      // Set base stock to exactly 1
      await Inventory.findByIdAndUpdate(base._id, { stock: 1 });

      // Create 2 pending orders
      const ord1 = await request(app)
        .post('/api/orders/create-razorpay-order')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({
          items: [
            {
              type: 'custom',
              customDetails: {
                baseId: base._id,
                sauceId: sauce._id,
                cheeseId: cheese._id
              },
              quantity: 1
            }
          ],
          deliveryAddress: 'Race St 1'
        });

      const ord2 = await request(app)
        .post('/api/orders/create-razorpay-order')
        .set('Authorization', `Bearer ${customerBToken}`)
        .send({
          items: [
            {
              type: 'custom',
              customDetails: {
                baseId: base._id,
                sauceId: sauce._id,
                cheeseId: cheese._id
              },
              quantity: 1
            }
          ],
          deliveryAddress: 'Race St 2'
        });

      const pay1 = 'pay_race_1';
      const sig1 = generateSignature(ord1.body.razorpayOrderId, pay1);

      const pay2 = 'pay_race_2';
      const sig2 = generateSignature(ord2.body.razorpayOrderId, pay2);

      // Concurrent verification requests
      const [res1, res2] = await Promise.all([
        request(app)
          .post('/api/orders/verify-payment')
          .set('Authorization', `Bearer ${customerAToken}`)
          .send({
            orderId: ord1.body.orderId,
            razorpay_order_id: ord1.body.razorpayOrderId,
            razorpay_payment_id: pay1,
            razorpay_signature: sig1
          }),
        request(app)
          .post('/api/orders/verify-payment')
          .set('Authorization', `Bearer ${customerBToken}`)
          .send({
            orderId: ord2.body.orderId,
            razorpay_order_id: ord2.body.razorpayOrderId,
            razorpay_payment_id: pay2,
            razorpay_signature: sig2
          })
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([200, 400]);

      const finalBase = await Inventory.findById(base._id);
      expect(finalBase.stock).toBe(0);
    });

    it('ADV_ORD_09: Multi-ingredient all-or-nothing atomicity rollback', async () => {
      // Base stock 10, Sauce stock 10, but Cheese stock 0
      await Inventory.findByIdAndUpdate(cheese._id, { stock: 0 });

      const ord = await request(app)
        .post('/api/orders/create-razorpay-order')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({
          items: [
            {
              type: 'custom',
              customDetails: {
                baseId: base._id,
                sauceId: sauce._id,
                cheeseId: cheese._id
              },
              quantity: 1
            }
          ],
          deliveryAddress: 'Atomicity St'
        });

      // Even if create-order caught it or let it pass, verify-payment must fail atomically
      // Let's create an order manually in pending state to test verify-payment decrement failure & compensation
      const directOrder = await Order.create({
        user: customerA._id,
        items: [
          {
            type: 'custom',
            customDetails: {
              base: base._id,
              sauce: sauce._id,
              cheese: cheese._id,
              baseId: base._id,
              sauceId: sauce._id,
              cheeseId: cheese._id
            },
            quantity: 1,
            unitPrice: 250,
            subtotal: 250
          }
        ],
        totalAmount: 250,
        deliveryAddress: 'Atomicity Test St',
        paymentStatus: 'pending',
        orderStatus: 'Created',
        razorpayOrderId: 'order_atomicity_test'
      });

      const payId = 'pay_atom_' + Date.now();
      const sig = generateSignature(directOrder.razorpayOrderId, payId);

      const verRes = await request(app)
        .post('/api/orders/verify-payment')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({
          orderId: directOrder._id.toString(),
          razorpay_order_id: directOrder.razorpayOrderId,
          razorpay_payment_id: payId,
          razorpay_signature: sig
        });

      expect(verRes.status).toBe(400);
      expect(verRes.body.error).toMatch(/insufficient stock/i);

      // Verify that base stock was NOT decremented or was safely rolled back
      const baseAfter = await Inventory.findById(base._id);
      expect(baseAfter.stock).toBe(10);
    });

    it('ADV_ORD_10: High-concurrency parallel order verification against scarce inventory', async () => {
      // 3 units available
      await Inventory.findByIdAndUpdate(base._id, { stock: 3 });

      // Create 5 orders
      const orders = [];
      for (let i = 0; i < 5; i++) {
        const o = await Order.create({
          user: customerA._id,
          items: [
            {
              type: 'custom',
              customDetails: {
                base: base._id,
                sauce: sauce._id,
                cheese: cheese._id,
                baseId: base._id,
                sauceId: sauce._id,
                cheeseId: cheese._id
              },
              quantity: 1,
              unitPrice: 250,
              subtotal: 250
            }
          ],
          totalAmount: 250,
          deliveryAddress: `Parallel St ${i}`,
          paymentStatus: 'pending',
          orderStatus: 'Created',
          razorpayOrderId: `order_parallel_${i}`
        });
        orders.push(o);
      }

      // Fire 5 verifications simultaneously
      const results = await Promise.all(
        orders.map((o, idx) => {
          const payId = `pay_par_${idx}`;
          const sig = generateSignature(o.razorpayOrderId, payId);
          return request(app)
            .post('/api/orders/verify-payment')
            .set('Authorization', `Bearer ${customerAToken}`)
            .send({
              orderId: o._id.toString(),
              razorpay_order_id: o.razorpayOrderId,
              razorpay_payment_id: payId,
              razorpay_signature: sig
            });
        })
      );

      const successCount = results.filter((r) => r.status === 200).length;
      const failCount = results.filter((r) => r.status === 400).length;

      expect(successCount).toBe(3);
      expect(failCount).toBe(2);

      const baseFinal = await Inventory.findById(base._id);
      expect(baseFinal.stock).toBe(0);
    });
  });

  describe('Dimension 4: IDOR & Status Hijacking', () => {
    it('ADV_ORD_11: IDOR: Customer B cannot verify payment on Customer A order', async () => {
      const ord = await request(app)
        .post('/api/orders/create-razorpay-order')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({
          items: [
            {
              type: 'custom',
              customDetails: {
                baseId: base._id,
                sauceId: sauce._id,
                cheeseId: cheese._id
              },
              quantity: 1
            }
          ],
          deliveryAddress: 'Customer A Address'
        });

      const payId = 'pay_idor_1';
      const sig = generateSignature(ord.body.razorpayOrderId, payId);

      // Customer B attempts verification
      const res = await request(app)
        .post('/api/orders/verify-payment')
        .set('Authorization', `Bearer ${customerBToken}`)
        .send({
          orderId: ord.body.orderId,
          razorpay_order_id: ord.body.razorpayOrderId,
          razorpay_payment_id: payId,
          razorpay_signature: sig
        });

      expect(res.status).toBe(403);
    });

    it('ADV_ORD_12: Reverse status progression hijack rejected', async () => {
      const deliveredOrder = await Order.create({
        user: customerA._id,
        items: [
          {
            type: 'custom',
            quantity: 1,
            unitPrice: 250,
            subtotal: 250
          }
        ],
        totalAmount: 250,
        deliveryAddress: 'Delivered St',
        paymentStatus: 'paid',
        orderStatus: 'Delivered',
        razorpayOrderId: 'order_delivered_hijack'
      });

      const res = await request(app)
        .patch(`/api/admin/orders/${deliveredOrder._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'Order Received' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/already delivered/i);
    });

    it('ADV_ORD_13: Status payload injection attack rejected', async () => {
      const order = await Order.create({
        user: customerA._id,
        items: [
          {
            type: 'custom',
            quantity: 1,
            unitPrice: 250,
            subtotal: 250
          }
        ],
        totalAmount: 250,
        deliveryAddress: 'Injection St',
        paymentStatus: 'paid',
        orderStatus: 'Order Received',
        razorpayOrderId: 'order_injection_test'
      });

      const res = await request(app)
        .patch(`/api/admin/orders/${order._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: '<script>alert(1)</script>' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid status/i);
    });
  });
});
