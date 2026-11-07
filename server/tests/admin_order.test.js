const request = require('supertest');
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
const Order = require('../models/Order');

describe('Admin Order Management Suite (M2)', () => {
  let adminToken;
  let consumerToken;
  let adminUser;
  let consumerUser;
  let orderReceived;
  let orderInKitchen;
  let orderSentToDelivery;
  let orderDelivered;

  const generateToken = (user) => {
    return jwt.sign(
      { id: user._id.toString(), role: user.role },
      process.env.JWT_SECRET || 'test_jwt_secret_key_12345',
      { expiresIn: '1h' }
    );
  };

  beforeEach(async () => {
    // Seed admin
    adminUser = await User.create({
      name: 'Admin Tester',
      email: 'admin_test@pizzadelivery.com',
      password: 'AdminPassword123!',
      role: 'admin',
      isVerified: true
    });
    adminToken = generateToken(adminUser);

    // Seed consumer
    consumerUser = await User.create({
      name: 'Regular Consumer',
      email: 'consumer_test@example.com',
      password: 'UserPassword123!',
      role: 'user',
      isVerified: true
    });
    consumerToken = generateToken(consumerUser);

    // Seed orders
    orderReceived = await Order.create({
      user: consumerUser._id,
      items: [
        {
          type: 'custom',
          quantity: 1,
          unitPrice: 150,
          subtotal: 150
        }
      ],
      totalAmount: 150,
      deliveryAddress: 'Order Received St',
      paymentStatus: 'paid',
      orderStatus: 'Order Received',
      razorpayOrderId: 'order_rzp_rec_1',
      statusHistory: [{ status: 'Order Received', timestamp: new Date(), note: 'Initial status' }]
    });

    orderInKitchen = await Order.create({
      user: consumerUser._id,
      items: [
        {
          type: 'custom',
          quantity: 1,
          unitPrice: 200,
          subtotal: 200
        }
      ],
      totalAmount: 200,
      deliveryAddress: 'Kitchen Way',
      paymentStatus: 'paid',
      orderStatus: 'In Kitchen',
      razorpayOrderId: 'order_rzp_kit_1',
      statusHistory: [{ status: 'In Kitchen', timestamp: new Date(), note: 'In kitchen' }]
    });

    orderSentToDelivery = await Order.create({
      user: consumerUser._id,
      items: [
        {
          type: 'custom',
          quantity: 1,
          unitPrice: 250,
          subtotal: 250
        }
      ],
      totalAmount: 250,
      deliveryAddress: 'Delivery Rd',
      paymentStatus: 'paid',
      orderStatus: 'Sent to Delivery',
      razorpayOrderId: 'order_rzp_del_1',
      statusHistory: [{ status: 'Sent to Delivery', timestamp: new Date(), note: 'On route' }]
    });

    orderDelivered = await Order.create({
      user: consumerUser._id,
      items: [
        {
          type: 'custom',
          quantity: 1,
          unitPrice: 300,
          subtotal: 300
        }
      ],
      totalAmount: 300,
      deliveryAddress: 'Delivered Lane',
      paymentStatus: 'paid',
      orderStatus: 'Delivered',
      razorpayOrderId: 'order_rzp_dvd_1',
      statusHistory: [{ status: 'Delivered', timestamp: new Date(), note: 'Delivered to door' }]
    });
  });

  describe('GET /api/admin/orders', () => {
    it('ADM_ORD_01: Admin lists all customer orders', async () => {
      const res = await request(app)
        .get('/api/admin/orders')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(4);
      expect(res.body[0].user).toBeDefined();
    });

    it('ADM_ORD_02: Filter orders by status', async () => {
      const res = await request(app)
        .get('/api/admin/orders?status=In Kitchen')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(1);
      expect(res.body[0].orderStatus).toBe('In Kitchen');
    });

    it('ADM_ORD_03: Pagination support for admin orders', async () => {
      const res = await request(app)
        .get('/api/admin/orders?page=1&limit=2')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);
    });
  });

  describe('PATCH /api/admin/orders/:id/status', () => {
    it('ADM_ORD_04: Valid status transition: "Order Received" -> "In Kitchen"', async () => {
      const res = await request(app)
        .patch(`/api/admin/orders/${orderReceived._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'In Kitchen' });

      expect(res.status).toBe(200);
      expect(res.body.order.orderStatus).toBe('In Kitchen');

      const updated = await Order.findById(orderReceived._id);
      expect(updated.orderStatus).toBe('In Kitchen');
    });

    it('ADM_ORD_05: Valid status transition: "In Kitchen" -> "Sent to Delivery"', async () => {
      const res = await request(app)
        .patch(`/api/admin/orders/${orderInKitchen._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'Sent to Delivery' });

      expect(res.status).toBe(200);
      expect(res.body.order.orderStatus).toBe('Sent to Delivery');
    });

    it('ADM_ORD_06: Valid status transition: "Sent to Delivery" -> "Delivered"', async () => {
      const res = await request(app)
        .patch(`/api/admin/orders/${orderSentToDelivery._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'Delivered' });

      expect(res.status).toBe(200);
      expect(res.body.order.orderStatus).toBe('Delivered');
    });

    it('ADM_ORD_07: Status History Auditing', async () => {
      await request(app)
        .patch(`/api/admin/orders/${orderReceived._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'In Kitchen' });

      const updated = await Order.findById(orderReceived._id);
      expect(updated.statusHistory.length).toBeGreaterThanOrEqual(2);
      const lastEntry = updated.statusHistory[updated.statusHistory.length - 1];
      expect(lastEntry.status).toBe('In Kitchen');
      expect(lastEntry.updatedBy.toString()).toBe(adminUser._id.toString());
    });

    it('ADM_ORD_08: Prevent regression on Delivered order', async () => {
      const res = await request(app)
        .patch(`/api/admin/orders/${orderDelivered._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'In Kitchen' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/already delivered/i);

      const unchanged = await Order.findById(orderDelivered._id);
      expect(unchanged.orderStatus).toBe('Delivered');
    });

    it('ADM_ORD_09: Reject invalid status string', async () => {
      const res = await request(app)
        .patch(`/api/admin/orders/${orderReceived._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'BakingInOven' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid status/i);
    });

    it('ADM_ORD_10: Patch status on non-existent order ID', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .patch(`/api/admin/orders/${fakeId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'In Kitchen' });

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/order not found/i);
    });
  });

  describe('RBAC Guards', () => {
    it('ADM_ORD_11: Consumer user blocked from listing admin orders (403)', async () => {
      const res = await request(app)
        .get('/api/admin/orders')
        .set('Authorization', `Bearer ${consumerToken}`);

      expect(res.status).toBe(403);
    });

    it('ADM_ORD_12: Consumer user blocked from patching order status (403)', async () => {
      const res = await request(app)
        .patch(`/api/admin/orders/${orderReceived._id}/status`)
        .set('Authorization', `Bearer ${consumerToken}`)
        .send({ status: 'In Kitchen' });

      expect(res.status).toBe(403);
    });

    it('ADM_ORD_13: Unauthenticated access to admin routes returns 401', async () => {
      const getRes = await request(app).get('/api/admin/orders');
      expect(getRes.status).toBe(401);

      const patchRes = await request(app)
        .patch(`/api/admin/orders/${orderReceived._id}/status`)
        .send({ status: 'In Kitchen' });
      expect(patchRes.status).toBe(401);
    });
  });
});
