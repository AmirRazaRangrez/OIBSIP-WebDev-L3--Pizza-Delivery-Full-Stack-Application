const request = require('supertest');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

// Mock Razorpay SDK before loading app
jest.mock('razorpay', () => {
  return jest.fn().mockImplementation(() => ({
    orders: {
      create: jest.fn().mockImplementation(async (params) => ({
        id: 'order_rzp_calc_' + Math.random().toString(36).substring(7),
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

describe('Comprehensive Accurate Calculation & Pricing Engine Test Suite', () => {
  let userToken;
  let testUser;

  // Base ingredients
  let thinCrust;
  let cheeseBurst;
  let marinaraSauce;
  let periPeriSauce;
  let mozzarellaCheese;
  let cheddarCheese;

  // Veggies
  let bellPeppers;
  let mushrooms;
  let jalapenos;
  let sweetCorn;
  let blackOlives;

  // Preconfigured pizzas
  let margheritaPizza;
  let farmhousePizza;
  let veggieSupremePizza;

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
    // 1. Seed customer
    testUser = await User.create({
      name: 'Calculation Test Customer',
      email: 'calc.test@example.com',
      password: 'Password123!',
      role: 'user',
      isVerified: true
    });
    userToken = generateToken(testUser);

    // 2. Seed inventory with explicit pricing
    // Bases
    thinCrust = await Inventory.create({
      name: 'Thin Crust',
      category: 'base',
      price: 60,
      stock: 100,
      threshold: 15
    });
    cheeseBurst = await Inventory.create({
      name: 'Cheese Burst',
      category: 'base',
      price: 110,
      stock: 100,
      threshold: 15
    });

    // Sauces
    marinaraSauce = await Inventory.create({
      name: 'Classic Marinara',
      category: 'sauce',
      price: 30,
      stock: 100,
      threshold: 15
    });
    periPeriSauce = await Inventory.create({
      name: 'Spicy Peri-Peri',
      category: 'sauce',
      price: 45,
      stock: 100,
      threshold: 15
    });

    // Cheeses
    mozzarellaCheese = await Inventory.create({
      name: 'Mozzarella',
      category: 'cheese',
      price: 60,
      stock: 100,
      threshold: 15
    });
    cheddarCheese = await Inventory.create({
      name: 'Aged Cheddar',
      category: 'cheese',
      price: 75,
      stock: 100,
      threshold: 15
    });

    // Veggies
    bellPeppers = await Inventory.create({
      name: 'Bell Peppers',
      category: 'veggie',
      price: 30,
      stock: 100,
      threshold: 15
    });
    mushrooms = await Inventory.create({
      name: 'Mushrooms',
      category: 'veggie',
      price: 35,
      stock: 100,
      threshold: 15
    });
    jalapenos = await Inventory.create({
      name: 'Jalapenos',
      category: 'veggie',
      price: 25,
      stock: 100,
      threshold: 15
    });
    sweetCorn = await Inventory.create({
      name: 'Sweet Corn',
      category: 'veggie',
      price: 25,
      stock: 100,
      threshold: 15
    });
    blackOlives = await Inventory.create({
      name: 'Black Olives',
      category: 'veggie',
      price: 40,
      stock: 100,
      threshold: 15
    });

    // 3. Seed preconfigured pizzas with known pricing
    margheritaPizza = await Pizza.create({
      name: 'Margherita',
      description: 'Classic cheese pizza',
      price: 279,
      isAvailable: true,
      ingredients: [
        { inventoryId: thinCrust._id, name: thinCrust.name, category: 'base', quantity: 1 },
        { inventoryId: marinaraSauce._id, name: marinaraSauce.name, category: 'sauce', quantity: 1 },
        { inventoryId: mozzarellaCheese._id, name: mozzarellaCheese.name, category: 'cheese', quantity: 1 }
      ]
    });

    farmhousePizza = await Pizza.create({
      name: 'Farmhouse',
      description: 'Loaded with veggies',
      price: 429,
      isAvailable: true,
      ingredients: [
        { inventoryId: thinCrust._id, name: thinCrust.name, category: 'base', quantity: 1 },
        { inventoryId: marinaraSauce._id, name: marinaraSauce.name, category: 'sauce', quantity: 1 },
        { inventoryId: mozzarellaCheese._id, name: mozzarellaCheese.name, category: 'cheese', quantity: 1 },
        { inventoryId: bellPeppers._id, name: bellPeppers.name, category: 'veggie', quantity: 1 },
        { inventoryId: mushrooms._id, name: mushrooms.name, category: 'veggie', quantity: 1 }
      ]
    });

    veggieSupremePizza = await Pizza.create({
      name: 'Veggie Supreme',
      description: 'Artisan cheese burst pizza',
      price: 499,
      isAvailable: true,
      ingredients: [
        { inventoryId: cheeseBurst._id, name: cheeseBurst.name, category: 'base', quantity: 1 },
        { inventoryId: periPeriSauce._id, name: periPeriSauce.name, category: 'sauce', quantity: 1 },
        { inventoryId: cheddarCheese._id, name: cheddarCheese.name, category: 'cheese', quantity: 1 },
        { inventoryId: blackOlives._id, name: blackOlives.name, category: 'veggie', quantity: 1 }
      ]
    });
  });

  // =========================================================================
  // SUITE 1: Preconfigured Pizza Mathematical Accuracy
  // =========================================================================
  describe('Suite 1: Preconfigured Pizza Price Multiplications', () => {
    it('CALC_01: Single quantity preconfigured pizza (unitPrice * 1)', async () => {
      const res = await request(app)
        .post('/api/orders/create-razorpay-order')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          items: [{ type: 'preconfigured', pizzaId: margheritaPizza._id, quantity: 1 }],
          deliveryAddress: 'Suite 101, Test Lane'
        });

      expect(res.status).toBe(200);
      expect(res.body.amount).toBe(27900); // 279 * 100 paise

      const order = await Order.findById(res.body.orderId);
      expect(order.totalAmount).toBe(279);
      expect(order.items[0].unitPrice).toBe(279);
      expect(order.items[0].quantity).toBe(1);
      expect(order.items[0].subtotal).toBe(279);
    });

    it('CALC_02: Multi-quantity preconfigured pizza (unitPrice * 4)', async () => {
      const quantity = 4;
      const expectedTotal = 279 * quantity; // 1116
      const expectedPaise = expectedTotal * 100; // 111600

      const res = await request(app)
        .post('/api/orders/create-razorpay-order')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          items: [{ type: 'preconfigured', pizzaId: margheritaPizza._id, quantity }],
          deliveryAddress: 'Suite 102, Test Lane'
        });

      expect(res.status).toBe(200);
      expect(res.body.amount).toBe(expectedPaise);

      const order = await Order.findById(res.body.orderId);
      expect(order.totalAmount).toBe(expectedTotal);
      expect(order.items[0].subtotal).toBe(expectedTotal);
    });

    it('CALC_03: Multi-item preconfigured cart accurate summation', async () => {
      // 2 x Margherita (279) + 3 x Farmhouse (429) + 1 x Veggie Supreme (499)
      // (2 * 279) + (3 * 429) + (1 * 499) = 558 + 1287 + 499 = 2344
      const expectedSubtotal1 = 2 * 279; // 558
      const expectedSubtotal2 = 3 * 429; // 1287
      const expectedSubtotal3 = 1 * 499; // 499
      const expectedTotal = expectedSubtotal1 + expectedSubtotal2 + expectedSubtotal3; // 2344
      const expectedPaise = expectedTotal * 100; // 234400

      const res = await request(app)
        .post('/api/orders/create-razorpay-order')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          items: [
            { type: 'preconfigured', pizzaId: margheritaPizza._id, quantity: 2 },
            { type: 'preconfigured', pizzaId: farmhousePizza._id, quantity: 3 },
            { type: 'preconfigured', pizzaId: veggieSupremePizza._id, quantity: 1 }
          ],
          deliveryAddress: 'Suite 103, Test Lane'
        });

      expect(res.status).toBe(200);
      expect(res.body.amount).toBe(expectedPaise);

      const order = await Order.findById(res.body.orderId);
      expect(order.totalAmount).toBe(expectedTotal);
      expect(order.items).toHaveLength(3);
      expect(order.items[0].subtotal).toBe(expectedSubtotal1);
      expect(order.items[1].subtotal).toBe(expectedSubtotal2);
      expect(order.items[2].subtotal).toBe(expectedSubtotal3);

      // Verify line items sum exactly equals totalAmount
      const computedSum = order.items.reduce((acc, item) => acc + item.subtotal, 0);
      expect(computedSum).toBe(order.totalAmount);
    });
  });

  // =========================================================================
  // SUITE 2: Custom Pizza Recipe & Multi-Topping Combinations
  // =========================================================================
  describe('Suite 2: Custom Pizza Recipe & Multi-Topping Mathematical Calculations', () => {
    it('CALC_04: Minimal custom pizza with 0 veggies (Base + Sauce + Cheese)', async () => {
      // Thin Crust (60) + Classic Marinara (30) + Mozzarella (60) = 150
      const expectedPrice = 60 + 30 + 60; // 150
      const expectedPaise = 150 * 100; // 15000

      const res = await request(app)
        .post('/api/orders/create-razorpay-order')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          items: [
            {
              type: 'custom',
              customDetails: {
                baseId: thinCrust._id,
                sauceId: marinaraSauce._id,
                cheeseId: mozzarellaCheese._id,
                veggieIds: []
              },
              quantity: 1
            }
          ],
          deliveryAddress: 'Minimal Custom St'
        });

      expect(res.status).toBe(200);
      expect(res.body.amount).toBe(expectedPaise);

      const order = await Order.findById(res.body.orderId);
      expect(order.totalAmount).toBe(expectedPrice);
      expect(order.items[0].unitPrice).toBe(expectedPrice);
      expect(order.items[0].subtotal).toBe(expectedPrice);
    });

    it('CALC_05: Premium custom pizza with Cheese Burst + Peri-Peri + Cheddar + 1 Veggie', async () => {
      // Cheese Burst (110) + Peri-Peri (45) + Cheddar (75) + Bell Peppers (30) = 260
      const expectedPrice = 110 + 45 + 75 + 30; // 260
      const expectedPaise = 260 * 100; // 26000

      const res = await request(app)
        .post('/api/orders/create-razorpay-order')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          items: [
            {
              type: 'custom',
              customDetails: {
                baseId: cheeseBurst._id,
                sauceId: periPeriSauce._id,
                cheeseId: cheddarCheese._id,
                veggieIds: [bellPeppers._id]
              },
              quantity: 1
            }
          ],
          deliveryAddress: 'Premium Custom St'
        });

      expect(res.status).toBe(200);
      expect(res.body.amount).toBe(expectedPaise);

      const order = await Order.findById(res.body.orderId);
      expect(order.totalAmount).toBe(expectedPrice);
    });

    it('CALC_06: Maximum toppings load: All 5 veggies + multi-quantity (qty: 3)', async () => {
      // Base: Thin Crust (60)
      // Sauce: Marinara (30)
      // Cheese: Mozzarella (60)
      // Veggies: Bell Peppers (30) + Mushrooms (35) + Jalapenos (25) + Sweet Corn (25) + Black Olives (40) = 155
      // Unit Price = 60 + 30 + 60 + 155 = 305
      // Quantity = 3 -> Total = 305 * 3 = 915 -> 91500 paise
      const unitPrice = 60 + 30 + 60 + (30 + 35 + 25 + 25 + 40); // 305
      const quantity = 3;
      const expectedTotal = unitPrice * quantity; // 915
      const expectedPaise = expectedTotal * 100; // 91500

      const res = await request(app)
        .post('/api/orders/create-razorpay-order')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          items: [
            {
              type: 'custom',
              customDetails: {
                baseId: thinCrust._id,
                sauceId: marinaraSauce._id,
                cheeseId: mozzarellaCheese._id,
                veggieIds: [
                  bellPeppers._id,
                  mushrooms._id,
                  jalapenos._id,
                  sweetCorn._id,
                  blackOlives._id
                ]
              },
              quantity
            }
          ],
          deliveryAddress: 'Max Toppings St'
        });

      expect(res.status).toBe(200);
      expect(res.body.amount).toBe(expectedPaise);

      const order = await Order.findById(res.body.orderId);
      expect(order.totalAmount).toBe(expectedTotal);
      expect(order.items[0].unitPrice).toBe(unitPrice);
      expect(order.items[0].subtotal).toBe(expectedTotal);
    });

    it('CALC_07: Repeated/duplicate toppings accurately counted into total price', async () => {
      // Base: Thin Crust (60)
      // Sauce: Marinara (30)
      // Cheese: Mozzarella (60)
      // Double Bell Peppers: [bellPeppers._id, bellPeppers._id] = 30 + 30 = 60
      // Unit Price = 60 + 30 + 60 + 60 = 210
      const expectedUnitPrice = 60 + 30 + 60 + 30 + 30; // 210
      const expectedPaise = expectedUnitPrice * 100; // 21000

      const res = await request(app)
        .post('/api/orders/create-razorpay-order')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          items: [
            {
              type: 'custom',
              customDetails: {
                baseId: thinCrust._id,
                sauceId: marinaraSauce._id,
                cheeseId: mozzarellaCheese._id,
                veggieIds: [bellPeppers._id, bellPeppers._id]
              },
              quantity: 1
            }
          ],
          deliveryAddress: 'Double Veggie St'
        });

      expect(res.status).toBe(200);
      expect(res.body.amount).toBe(expectedPaise);

      const order = await Order.findById(res.body.orderId);
      expect(order.totalAmount).toBe(expectedUnitPrice);
    });
  });

  // =========================================================================
  // SUITE 3: Complex Mixed Carts & High-Volume Accurate Summations
  // =========================================================================
  describe('Suite 3: Mixed Carts (Custom + Preconfigured) & High Volume Summations', () => {
    it('CALC_08: Complex mixed cart with 2 custom pizzas and 2 preconfigured pizzas', async () => {
      // Item 1: 2x Margherita @ 279 = 558
      // Item 2: 1x Farmhouse @ 429 = 429
      // Item 3: 2x Custom Pizza (Thin 60 + Marinara 30 + Mozzarella 60 + Mushrooms 35 = 185) -> 2 * 185 = 370
      // Item 4: 1x Custom Pizza (Cheese Burst 110 + Peri-Peri 45 + Cheddar 75 + Olives 40 = 270) -> 1 * 270 = 270
      // Grand Total = 558 + 429 + 370 + 270 = 1627
      const item1Subtotal = 2 * 279; // 558
      const item2Subtotal = 1 * 429; // 429
      const item3Subtotal = 2 * (60 + 30 + 60 + 35); // 370
      const item4Subtotal = 1 * (110 + 45 + 75 + 40); // 270
      const grandTotal = item1Subtotal + item2Subtotal + item3Subtotal + item4Subtotal; // 1627
      const expectedPaise = grandTotal * 100; // 162700

      const res = await request(app)
        .post('/api/orders/create-razorpay-order')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          items: [
            { type: 'preconfigured', pizzaId: margheritaPizza._id, quantity: 2 },
            { type: 'preconfigured', pizzaId: farmhousePizza._id, quantity: 1 },
            {
              type: 'custom',
              customDetails: {
                baseId: thinCrust._id,
                sauceId: marinaraSauce._id,
                cheeseId: mozzarellaCheese._id,
                veggieIds: [mushrooms._id]
              },
              quantity: 2
            },
            {
              type: 'custom',
              customDetails: {
                baseId: cheeseBurst._id,
                sauceId: periPeriSauce._id,
                cheeseId: cheddarCheese._id,
                veggieIds: [blackOlives._id]
              },
              quantity: 1
            }
          ],
          deliveryAddress: 'Grand Feast Blvd'
        });

      expect(res.status).toBe(200);
      expect(res.body.amount).toBe(expectedPaise);

      const order = await Order.findById(res.body.orderId);
      expect(order.totalAmount).toBe(grandTotal);
      expect(order.items).toHaveLength(4);

      // Verify each item's subtotal matches expected math
      expect(order.items[0].subtotal).toBe(item1Subtotal);
      expect(order.items[1].subtotal).toBe(item2Subtotal);
      expect(order.items[2].subtotal).toBe(item3Subtotal);
      expect(order.items[3].subtotal).toBe(item4Subtotal);
    });

    it('CALC_09: High-volume valid bulk order calculation (qty: 45 within stock)', async () => {
      const quantity = 45;
      const expectedTotal = 279 * quantity; // 12555
      const expectedPaise = expectedTotal * 100; // 1255500

      const res = await request(app)
        .post('/api/orders/create-razorpay-order')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          items: [{ type: 'preconfigured', pizzaId: margheritaPizza._id, quantity }],
          deliveryAddress: 'Corporate Catering Hall'
        });

      expect(res.status).toBe(200);
      expect(res.body.amount).toBe(expectedPaise);

      const order = await Order.findById(res.body.orderId);
      expect(order.totalAmount).toBe(expectedTotal);
    });
  });

  // =========================================================================
  // SUITE 4: Floating Point Immunity & Razorpay Paise Conversion Precision
  // =========================================================================
  describe('Suite 4: Floating Point Precision & Exact Paise Conversion', () => {
    it('CALC_10: Razorpay amount in paise strictly uses Math.round to avoid IEEE-754 precision drift', async () => {
      // Create custom items with decimal pricing to verify precision
      const decimalBase = await Inventory.create({
        name: 'Artisan Sourdough',
        category: 'base',
        price: 89.5,
        stock: 50,
        threshold: 10
      });
      const decimalSauce = await Inventory.create({
        name: 'Truffle Pesto',
        category: 'sauce',
        price: 49.75,
        stock: 50,
        threshold: 10
      });
      const decimalCheese = await Inventory.create({
        name: 'Burrata',
        category: 'cheese',
        price: 110.25,
        stock: 50,
        threshold: 10
      });

      // Unit price = 89.50 + 49.75 + 110.25 = 249.50
      // 3 pizzas = 249.50 * 3 = 748.50
      // Paise = 748.50 * 100 = 74850
      const unitPrice = 89.5 + 49.75 + 110.25; // 249.50
      const totalAmount = unitPrice * 3; // 748.50
      const expectedPaise = Math.round(totalAmount * 100); // 74850

      const res = await request(app)
        .post('/api/orders/create-razorpay-order')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          items: [
            {
              type: 'custom',
              customDetails: {
                baseId: decimalBase._id,
                sauceId: decimalSauce._id,
                cheeseId: decimalCheese._id
              },
              quantity: 3
            }
          ],
          deliveryAddress: 'Gourmet Lab'
        });

      expect(res.status).toBe(200);
      expect(res.body.amount).toBe(expectedPaise);
      expect(Number.isInteger(res.body.amount)).toBe(true);

      const order = await Order.findById(res.body.orderId);
      expect(order.totalAmount).toBe(totalAmount);
    });
  });

  // =========================================================================
  // SUITE 5: Inventory Arithmetic & Stock Consumption Accuracy
  // =========================================================================
  describe('Suite 5: Inventory Stock Deduction Arithmetic & Multi-Item Shared Stock', () => {
    it('CALC_11: Exact stock deduction for preconfigured pizza upon payment confirmation', async () => {
      // Margherita uses: 1 Thin Crust, 1 Marinara, 1 Mozzarella
      // Order 4 Margheritas -> exactly 4 units deducted from each
      const initialThinStock = thinCrust.stock; // 100
      const initialMarinaraStock = marinaraSauce.stock; // 100
      const initialMozzarellaStock = mozzarellaCheese.stock; // 100

      const orderRes = await request(app)
        .post('/api/orders/create-razorpay-order')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          items: [{ type: 'preconfigured', pizzaId: margheritaPizza._id, quantity: 4 }],
          deliveryAddress: 'Inventory Deduction St'
        });

      const { orderId, razorpayOrderId } = orderRes.body;
      const razorpayPaymentId = 'pay_calc_mock_001';
      const signature = generateSignature(razorpayOrderId, razorpayPaymentId);

      // Verify payment
      const verifyRes = await request(app)
        .post('/api/orders/verify-payment')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          orderId,
          razorpay_order_id: razorpayOrderId,
          razorpay_payment_id: razorpayPaymentId,
          razorpay_signature: signature
        });

      expect(verifyRes.status).toBe(200);

      // Verify exact stock math
      const updatedThin = await Inventory.findById(thinCrust._id);
      const updatedMarinara = await Inventory.findById(marinaraSauce._id);
      const updatedMozzarella = await Inventory.findById(mozzarellaCheese._id);

      expect(updatedThin.stock).toBe(initialThinStock - 4); // 96
      expect(updatedMarinara.stock).toBe(initialMarinaraStock - 4); // 96
      expect(updatedMozzarella.stock).toBe(initialMozzarellaStock - 4); // 96
    });

    it('CALC_12: Shared ingredient deduction across multiple items in the same order', async () => {
      // Mozzarella is used by:
      // Item 1: Margherita (qty: 3) -> requires 3 Mozzarella
      // Item 2: Custom Pizza (qty: 2) -> requires 2 Mozzarella
      // Total Mozzarella consumed = 3 + 2 = 5
      const initialMozzarella = (await Inventory.findById(mozzarellaCheese._id)).stock;

      const orderRes = await request(app)
        .post('/api/orders/create-razorpay-order')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          items: [
            { type: 'preconfigured', pizzaId: margheritaPizza._id, quantity: 3 },
            {
              type: 'custom',
              customDetails: {
                baseId: thinCrust._id,
                sauceId: marinaraSauce._id,
                cheeseId: mozzarellaCheese._id,
                veggieIds: [bellPeppers._id]
              },
              quantity: 2
            }
          ],
          deliveryAddress: 'Shared Mozzarella St'
        });

      const { orderId, razorpayOrderId } = orderRes.body;
      const razorpayPaymentId = 'pay_calc_mock_002';
      const signature = generateSignature(razorpayOrderId, razorpayPaymentId);

      const verifyRes = await request(app)
        .post('/api/orders/verify-payment')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          orderId,
          razorpay_order_id: razorpayOrderId,
          razorpay_payment_id: razorpayPaymentId,
          razorpay_signature: signature
        });

      expect(verifyRes.status).toBe(200);

      const updatedMozzarella = await Inventory.findById(mozzarellaCheese._id);
      expect(updatedMozzarella.stock).toBe(initialMozzarella - 5);
    });

    it('CALC_13: Exact boundary stock consumption (stock === quantity leaves 0)', async () => {
      // Create limited inventory item with stock = 2
      const limitedBase = await Inventory.create({
        name: 'Limited Base',
        category: 'base',
        price: 50,
        stock: 2,
        threshold: 1
      });

      const orderRes = await request(app)
        .post('/api/orders/create-razorpay-order')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          items: [
            {
              type: 'custom',
              customDetails: {
                baseId: limitedBase._id,
                sauceId: marinaraSauce._id,
                cheeseId: mozzarellaCheese._id
              },
              quantity: 2
            }
          ],
          deliveryAddress: 'Exact Boundary St'
        });

      expect(orderRes.status).toBe(200);

      const { orderId, razorpayOrderId } = orderRes.body;
      const razorpayPaymentId = 'pay_calc_mock_003';
      const signature = generateSignature(razorpayOrderId, razorpayPaymentId);

      await request(app)
        .post('/api/orders/verify-payment')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          orderId,
          razorpay_order_id: razorpayOrderId,
          razorpay_payment_id: razorpayPaymentId,
          razorpay_signature: signature
        });

      const updatedBase = await Inventory.findById(limitedBase._id);
      expect(updatedBase.stock).toBe(0);
    });

    it('CALC_14: Insufficient stock arithmetic prevents order creation and preserves stock intact', async () => {
      const scarceCheese = await Inventory.create({
        name: 'Scarce Truffle Cheese',
        category: 'cheese',
        price: 150,
        stock: 3,
        threshold: 1
      });

      // Attempt to order 4 (available is 3)
      const res = await request(app)
        .post('/api/orders/create-razorpay-order')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          items: [
            {
              type: 'custom',
              customDetails: {
                baseId: thinCrust._id,
                sauceId: marinaraSauce._id,
                cheeseId: scarceCheese._id
              },
              quantity: 4
            }
          ],
          deliveryAddress: 'Scarce St'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/insufficient stock/i);

      // Verify stock was not deducted
      const unchangedCheese = await Inventory.findById(scarceCheese._id);
      expect(unchangedCheese.stock).toBe(3);
    });
  });

  // =========================================================================
  // SUITE 6: Server Calculation Immunity against Client Price Tampering
  // =========================================================================
  describe('Suite 6: Server Calculation Immunity Against Client Manipulation', () => {
    it('CALC_15: Server completely overrides client-provided totalAmount with calculated DB price', async () => {
      // Real price: Margherita 279
      // Client tries to inject totalAmount: 1
      const res = await request(app)
        .post('/api/orders/create-razorpay-order')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          items: [
            {
              type: 'preconfigured',
              pizzaId: margheritaPizza._id,
              quantity: 1,
              price: 1,
              subtotal: 1
            }
          ],
          totalAmount: 1,
          amount: 100,
          deliveryAddress: 'Exploit Lane'
        });

      expect(res.status).toBe(200);
      expect(res.body.amount).toBe(27900); // Must be real 279 * 100

      const order = await Order.findById(res.body.orderId);
      expect(order.totalAmount).toBe(279);
    });

    it('CALC_16: Server recalculates custom pizza unitPrice ignoring client-injected 0 price', async () => {
      // Real: Thin Crust (60) + Marinara (30) + Mozzarella (60) = 150
      const res = await request(app)
        .post('/api/orders/create-razorpay-order')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          items: [
            {
              type: 'custom',
              customDetails: {
                baseId: thinCrust._id,
                sauceId: marinaraSauce._id,
                cheeseId: mozzarellaCheese._id
              },
              quantity: 1,
              unitPrice: 0,
              price: 0,
              subtotal: 0
            }
          ],
          deliveryAddress: 'Free Pizza Attempt'
        });

      expect(res.status).toBe(200);
      expect(res.body.amount).toBe(15000);

      const order = await Order.findById(res.body.orderId);
      expect(order.totalAmount).toBe(150);
      expect(order.items[0].unitPrice).toBe(150);
      expect(order.items[0].subtotal).toBe(150);
    });
  });

  // =========================================================================
  // SUITE 7: Quantity Arithmetic Validation & Rejection of Malformed Multipliers
  // =========================================================================
  describe('Suite 7: Quantity Multiplier Boundaries & Rejections', () => {
    it('CALC_17: Rejects zero quantity (qty: 0)', async () => {
      const res = await request(app)
        .post('/api/orders/create-razorpay-order')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          items: [{ type: 'preconfigured', pizzaId: margheritaPizza._id, quantity: 0 }],
          deliveryAddress: 'Zero Qty St'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/quantity/i);
    });

    it('CALC_18: Rejects negative quantity (qty: -3)', async () => {
      const res = await request(app)
        .post('/api/orders/create-razorpay-order')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          items: [{ type: 'preconfigured', pizzaId: margheritaPizza._id, quantity: -3 }],
          deliveryAddress: 'Negative Qty St'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/quantity/i);
    });

    it('CALC_19: Rejects fractional floating quantity (qty: 1.75)', async () => {
      const res = await request(app)
        .post('/api/orders/create-razorpay-order')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          items: [{ type: 'preconfigured', pizzaId: margheritaPizza._id, quantity: 1.75 }],
          deliveryAddress: 'Fractional Qty St'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/quantity/i);
    });

    it('CALC_20: Rejects non-numeric quantity ("two")', async () => {
      const res = await request(app)
        .post('/api/orders/create-razorpay-order')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          items: [{ type: 'preconfigured', pizzaId: margheritaPizza._id, quantity: 'two' }],
          deliveryAddress: 'String Qty St'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/quantity/i);
    });
  });

  // =========================================================================
  // SUITE 8: Client-Side to Server-Side Calculation Parity
  // =========================================================================
  describe('Suite 8: Client Formula Parity with Server Engine', () => {
    it('CALC_21: Client cart reduce formula produces identical result to server calculatedTotal', async () => {
      // Define a realistic simulated cart identical to React AuthContext state
      const simulatedCart = [
        {
          type: 'preconfigured',
          pizzaId: margheritaPizza._id.toString(),
          price: 279,
          quantity: 2
        },
        {
          type: 'preconfigured',
          pizzaId: farmhousePizza._id.toString(),
          price: 429,
          quantity: 1
        },
        {
          type: 'custom',
          name: 'Custom Pizza (Thin Crust)',
          price: 60 + 30 + 60 + 30 + 35, // 215
          quantity: 3,
          customDetails: {
            baseId: thinCrust._id,
            sauceId: marinaraSauce._id,
            cheeseId: mozzarellaCheese._id,
            veggieIds: [bellPeppers._id, mushrooms._id]
          }
        }
      ];

      // Client calculation: OrderSummary.jsx line 15:
      // const subtotal = cart.reduce((acc, item) => acc + (item.price * (item.quantity || 1)), 0);
      const clientCalculatedTotal = simulatedCart.reduce(
        (acc, item) => acc + item.price * (item.quantity || 1),
        0
      );
      // (279 * 2) + (429 * 1) + (215 * 3) = 558 + 429 + 645 = 1632
      expect(clientCalculatedTotal).toBe(1632);

      // Now send this exact cart to the server
      const res = await request(app)
        .post('/api/orders/create-razorpay-order')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          items: simulatedCart,
          deliveryAddress: 'Parity Test Lane'
        });

      expect(res.status).toBe(200);

      const serverOrder = await Order.findById(res.body.orderId);
      // Assert absolute zero discrepancy between client and server calculations
      expect(serverOrder.totalAmount).toBe(clientCalculatedTotal);
      expect(res.body.amount).toBe(clientCalculatedTotal * 100);
    });
  });
});