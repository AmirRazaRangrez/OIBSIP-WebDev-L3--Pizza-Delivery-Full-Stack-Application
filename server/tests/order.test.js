const request = require('supertest');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

// Mock Razorpay SDK before loading app
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
const Pizza = require('../models/Pizza');
const Order = require('../models/Order');

describe('Order & Payment Lifecycle Suite (M2)', () => {
  let userToken;
  let otherUserToken;
  let testUser;
  let otherUser;
  let base1;
  let sauce1;
  let cheese1;
  let veggie1;
  let veggie2;
  let preconfiguredPizza;

  const generateToken = (user) => {
    return jwt.sign(
      { id: user._id.toString(), role: user.role || 'user' },
      process.env.JWT_SECRET || 'test_jwt_secret_key_12345',
      { expiresIn: '1h' }
    );
  };

  const generateSignature = (orderId, paymentId) => {
    const secret = process.env.RAZORPAY_KEY_SECRET || 'FXnUylflZOnGsE4zoexrkIuv';
    return crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
  };

  beforeEach(async () => {
    // Seed users
    testUser = await User.create({
      name: 'Customer One',
      email: 'customer1@example.com',
      password: 'Password123!',
      role: 'user',
      isVerified: true
    });
    userToken = generateToken(testUser);

    otherUser = await User.create({
      name: 'Customer Two',
      email: 'customer2@example.com',
      password: 'Password123!',
      role: 'user',
      isVerified: true
    });
    otherUserToken = generateToken(otherUser);

    // Seed inventory
    base1 = await Inventory.create({
      name: 'Thin Crust Base',
      category: 'base',
      price: 60,
      stock: 50,
      threshold: 15
    });

    sauce1 = await Inventory.create({
      name: 'Marinara Sauce',
      category: 'sauce',
      price: 30,
      stock: 50,
      threshold: 15
    });

    cheese1 = await Inventory.create({
      name: 'Mozzarella Cheese',
      category: 'cheese',
      price: 60,
      stock: 50,
      threshold: 15
    });

    veggie1 = await Inventory.create({
      name: 'Bell Peppers',
      category: 'veggie',
      price: 30,
      stock: 50,
      threshold: 15
    });

    veggie2 = await Inventory.create({
      name: 'Mushrooms',
      category: 'veggie',
      price: 35,
      stock: 50,
      threshold: 15
    });

    // Seed preconfigured pizza
    preconfiguredPizza = await Pizza.create({
      name: 'Margherita',
      description: 'Classic cheese and tomato',
      price: 279,
      isAvailable: true,
      ingredients: [
        { inventoryId: base1._id, name: base1.name, category: 'base', quantity: 1 },
        { inventoryId: sauce1._id, name: sauce1.name, category: 'sauce', quantity: 1 },
        { inventoryId: cheese1._id, name: cheese1.name, category: 'cheese', quantity: 1 }
      ]
    });
  });

  describe('F08: Razorpay Order Creation & Pricing', () => {
    it('ORD_01: Calculate custom pizza price without veggies', async () => {
      const res = await request(app)
        .post('/api/orders/create-razorpay-order')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          items: [
            {
              type: 'custom',
              customDetails: {
                baseId: base1._id,
                sauceId: sauce1._id,
                cheeseId: cheese1._id
              },
              quantity: 1
            }
          ],
          deliveryAddress: '10 Downing St'
        });

      expect(res.status).toBe(200);
      expect(res.body.orderId).toBeDefined();
      expect(res.body.razorpayOrderId).toBeDefined();
      expect(res.body.currency).toBe('INR');
      expect(res.body.key).toBe(process.env.RAZORPAY_KEY_ID || 'rzp_test_Twlntm5UkURGg0');
      // 60 + 30 + 60 = 150 -> 15000 paise
      expect(res.body.amount).toBe(15000);

      const dbOrder = await Order.findById(res.body.orderId);
      expect(dbOrder).not.toBeNull();
      expect(dbOrder.paymentStatus).toBe('pending');
      expect(dbOrder.orderStatus).toBe('Created');
      expect(dbOrder.totalAmount).toBe(150);
    });

    it('ORD_02: Calculate custom pizza with multiple veggies', async () => {
      const res = await request(app)
        .post('/api/orders/create-razorpay-order')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          items: [
            {
              type: 'custom',
              customDetails: {
                baseId: base1._id,
                sauceId: sauce1._id,
                cheeseId: cheese1._id,
                veggieIds: [veggie1._id, veggie2._id]
              },
              quantity: 1
            }
          ],
          deliveryAddress: '221B Baker St'
        });

      expect(res.status).toBe(200);
      // 60 + 30 + 60 + 30 + 35 = 215 -> 21500 paise
      expect(res.body.amount).toBe(21500);
    });

    it('ORD_03: Proportionate price multiplication for multi-quantity', async () => {
      const res = await request(app)
        .post('/api/orders/create-razorpay-order')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          items: [
            {
              type: 'custom',
              customDetails: {
                baseId: base1._id,
                sauceId: sauce1._id,
                cheeseId: cheese1._id
              },
              quantity: 3
            }
          ],
          deliveryAddress: '742 Evergreen Terrace'
        });

      expect(res.status).toBe(200);
      // 150 * 3 = 450 -> 45000 paise
      expect(res.body.amount).toBe(45000);
    });

    it('ORD_04: Calculate pre-configured pizza price', async () => {
      const res = await request(app)
        .post('/api/orders/create-razorpay-order')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          items: [
            {
              type: 'preconfigured',
              pizzaId: preconfiguredPizza._id,
              quantity: 2
            }
          ],
          deliveryAddress: '31 Spooner St'
        });

      expect(res.status).toBe(200);
      // 279 * 2 = 558 -> 55800 paise
      expect(res.body.amount).toBe(55800);
    });

    it('ORD_05: Calculate mixed cart (custom + pre-configured)', async () => {
      const res = await request(app)
        .post('/api/orders/create-razorpay-order')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          items: [
            {
              type: 'custom',
              customDetails: {
                baseId: base1._id,
                sauceId: sauce1._id,
                cheeseId: cheese1._id
              },
              quantity: 1
            },
            {
              type: 'preconfigured',
              pizzaId: preconfiguredPizza._id,
              quantity: 1
            }
          ],
          deliveryAddress: 'Mixed Cart Blvd'
        });

      expect(res.status).toBe(200);
      // 150 + 279 = 429 -> 42900 paise
      expect(res.body.amount).toBe(42900);
    });

    it('ORD_06: Reject order creation with empty items array', async () => {
      const res = await request(app)
        .post('/api/orders/create-razorpay-order')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          items: [],
          deliveryAddress: 'Empty Items St'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/items/i);
    });

    it('ORD_07: Reject order creation with quantity <= 0', async () => {
      const res = await request(app)
        .post('/api/orders/create-razorpay-order')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          items: [
            {
              type: 'custom',
              customDetails: {
                baseId: base1._id,
                sauceId: sauce1._id,
                cheeseId: cheese1._id
              },
              quantity: 0
            }
          ],
          deliveryAddress: 'Zero Qty St'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/quantity/i);
    });

    it('ORD_08: Reject order creation with empty delivery address', async () => {
      const res = await request(app)
        .post('/api/orders/create-razorpay-order')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          items: [
            {
              type: 'custom',
              customDetails: {
                baseId: base1._id,
                sauceId: sauce1._id,
                cheeseId: cheese1._id
              },
              quantity: 1
            }
          ],
          deliveryAddress: '   '
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/delivery address/i);
    });

    it('ORD_09: Reject custom pizza missing base, sauce, or cheese', async () => {
      const res = await request(app)
        .post('/api/orders/create-razorpay-order')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          items: [
            {
              type: 'custom',
              customDetails: {
                sauceId: sauce1._id,
                cheeseId: cheese1._id
              },
              quantity: 1
            }
          ],
          deliveryAddress: 'Missing Base St'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/requires base, sauce, and cheese/i);
    });

    it('ORD_10: Reject order creation with non-existent ingredient ID', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .post('/api/orders/create-razorpay-order')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          items: [
            {
              type: 'custom',
              customDetails: {
                baseId: fakeId,
                sauceId: sauce1._id,
                cheeseId: cheese1._id
              },
              quantity: 1
            }
          ],
          deliveryAddress: 'Fake ID St'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid ingredient/i);
    });

    it('ORD_11: Reject order creation when requested stock is insufficient', async () => {
      await Inventory.findByIdAndUpdate(base1._id, { stock: 1 });

      const res = await request(app)
        .post('/api/orders/create-razorpay-order')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          items: [
            {
              type: 'custom',
              customDetails: {
                baseId: base1._id,
                sauceId: sauce1._id,
                cheeseId: cheese1._id
              },
              quantity: 5 // requires 5, only 1 available
            }
          ],
          deliveryAddress: 'Insufficient St'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/insufficient stock/i);
    });
  });

  describe('F09 & F07: Payment Verification & Atomic Stock Decrement', () => {
    let pendingOrder;

    beforeEach(async () => {
      const createRes = await request(app)
        .post('/api/orders/create-razorpay-order')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          items: [
            {
              type: 'custom',
              customDetails: {
                baseId: base1._id,
                sauceId: sauce1._id,
                cheeseId: cheese1._id,
                veggieIds: [veggie1._id, veggie2._id]
              },
              quantity: 2
            }
          ],
          deliveryAddress: 'Verification Test Ave'
        });

      pendingOrder = createRes.body;
    });

    it('ORD_12: Valid HMAC-SHA256 signature confirms payment', async () => {
      const paymentId = 'pay_test_' + Date.now();
      const signature = generateSignature(pendingOrder.razorpayOrderId, paymentId);

      const res = await request(app)
        .post('/api/orders/verify-payment')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          orderId: pendingOrder.orderId,
          razorpay_order_id: pendingOrder.razorpayOrderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: signature
        });

      expect(res.status).toBe(200);
      expect(res.body.order.paymentStatus).toBe('paid');
      expect(res.body.order.orderStatus).toBe('Order Received');
      expect(res.body.order.paidAt).toBeDefined();
    });

    it('ORD_13: Forged / invalid HMAC signature is rejected', async () => {
      const res = await request(app)
        .post('/api/orders/verify-payment')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          orderId: pendingOrder.orderId,
          razorpay_order_id: pendingOrder.razorpayOrderId,
          razorpay_payment_id: 'pay_bad_123',
          razorpay_signature: 'forged_hmac_signature_00000000000000'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/signature/i);

      const orderInDb = await Order.findById(pendingOrder.orderId);
      expect(orderInDb.paymentStatus).toBe('failed');
    });

    it('ORD_14: Atomic stock decrement on payment verification', async () => {
      const startBase = (await Inventory.findById(base1._id)).stock;
      const startSauce = (await Inventory.findById(sauce1._id)).stock;
      const startCheese = (await Inventory.findById(cheese1._id)).stock;

      const paymentId = 'pay_stock_' + Date.now();
      const signature = generateSignature(pendingOrder.razorpayOrderId, paymentId);

      const res = await request(app)
        .post('/api/orders/verify-payment')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          orderId: pendingOrder.orderId,
          razorpay_order_id: pendingOrder.razorpayOrderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: signature
        });

      expect(res.status).toBe(200);

      const endBase = (await Inventory.findById(base1._id)).stock;
      const endSauce = (await Inventory.findById(sauce1._id)).stock;
      const endCheese = (await Inventory.findById(cheese1._id)).stock;

      // Pending order had quantity 2
      expect(endBase).toBe(startBase - 2);
      expect(endSauce).toBe(startSauce - 2);
      expect(endCheese).toBe(startCheese - 2);
    });

    it('ORD_15: Multi-veggie selection stock decrement', async () => {
      const startV1 = (await Inventory.findById(veggie1._id)).stock;
      const startV2 = (await Inventory.findById(veggie2._id)).stock;

      const paymentId = 'pay_veg_' + Date.now();
      const signature = generateSignature(pendingOrder.razorpayOrderId, paymentId);

      await request(app)
        .post('/api/orders/verify-payment')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          orderId: pendingOrder.orderId,
          razorpay_order_id: pendingOrder.razorpayOrderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: signature
        });

      const endV1 = (await Inventory.findById(veggie1._id)).stock;
      const endV2 = (await Inventory.findById(veggie2._id)).stock;

      expect(endV1).toBe(startV1 - 2);
      expect(endV2).toBe(startV2 - 2);
    });

    it('ORD_16: Replay attack: Verifying already paid order rejected', async () => {
      const paymentId = 'pay_replay_' + Date.now();
      const signature = generateSignature(pendingOrder.razorpayOrderId, paymentId);

      const firstRes = await request(app)
        .post('/api/orders/verify-payment')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          orderId: pendingOrder.orderId,
          razorpay_order_id: pendingOrder.razorpayOrderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: signature
        });

      expect(firstRes.status).toBe(200);

      const secondRes = await request(app)
        .post('/api/orders/verify-payment')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          orderId: pendingOrder.orderId,
          razorpay_order_id: pendingOrder.razorpayOrderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: signature
        });

      expect(secondRes.status).toBe(400);
      expect(secondRes.body.error).toMatch(/already paid/i);
    });

    it('ORD_17: Verification with non-existent orderId returns 404', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .post('/api/orders/verify-payment')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          orderId: fakeId,
          razorpay_order_id: 'order_fake',
          razorpay_payment_id: 'pay_fake',
          razorpay_signature: 'sig_fake'
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/order not found/i);
    });
  });

  describe('F10: Customer Order Isolation', () => {
    it('ORD_18: User queries order history and sees placed orders', async () => {
      await Order.create({
        user: testUser._id,
        items: [
          {
            type: 'preconfigured',
            pizza: preconfiguredPizza._id,
            quantity: 1,
            unitPrice: 279,
            subtotal: 279
          }
        ],
        totalAmount: 279,
        deliveryAddress: 'My History St',
        paymentStatus: 'paid',
        orderStatus: 'Order Received',
        razorpayOrderId: 'order_test_history_1'
      });

      const res = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0].deliveryAddress).toBe('My History St');
    });

    it('ORD_19: User cannot view other customers orders (Horizontal Isolation)', async () => {
      await Order.create({
        user: testUser._id,
        items: [
          {
            type: 'preconfigured',
            pizza: preconfiguredPizza._id,
            quantity: 1,
            unitPrice: 279,
            subtotal: 279
          }
        ],
        totalAmount: 279,
        deliveryAddress: 'Customer One Secret St',
        paymentStatus: 'paid',
        orderStatus: 'Order Received',
        razorpayOrderId: 'order_user1_secret'
      });

      const res = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${otherUserToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some((o) => o.deliveryAddress === 'Customer One Secret St')).toBe(false);
    });

    it('ORD_20: Unauthenticated access to order endpoints blocked', async () => {
      const getRes = await request(app).get('/api/orders');
      expect(getRes.status).toBe(401);

      const postRes = await request(app)
        .post('/api/orders/create-razorpay-order')
        .send({ items: [] });
      expect(postRes.status).toBe(401);
    });
  });
});
