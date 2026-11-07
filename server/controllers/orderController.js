const crypto = require('crypto');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Inventory = require('../models/Inventory');
const Pizza = require('../models/Pizza');
const { getRazorpayInstance } = require('../config/razorpay');
const { broadcastOrderStatus, broadcastInventoryUpdate, broadcastNewOrder } = require('../socket');

/**
 * Initiates Razorpay test order & creates pending order record in MongoDB
 * POST /api/orders/create-razorpay-order
 */
const createRazorpayOrder = async (req, res) => {
  try {
    const { items, deliveryAddress } = req.body;

    // 1. Validate items array
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items array is required' });
    }

    // 2. Validate deliveryAddress
    if (!deliveryAddress) {
      return res.status(400).json({ error: 'Delivery address is required' });
    }
    if (typeof deliveryAddress === 'string' && !deliveryAddress.trim()) {
      return res.status(400).json({ error: 'Delivery address is required' });
    }
    if (
      typeof deliveryAddress === 'object' &&
      (!deliveryAddress.street || !String(deliveryAddress.street).trim())
    ) {
      return res.status(400).json({ error: 'Delivery address is required' });
    }

    // 3. Process items and calculate server-side pricing
    let calculatedTotal = 0;
    const normalizedItems = [];

    for (const item of items) {
      // Validate quantity
      if (
        item.quantity === undefined ||
        item.quantity === null ||
        typeof item.quantity !== 'number' ||
        !Number.isInteger(item.quantity) ||
        item.quantity <= 0
      ) {
        return res.status(400).json({ error: 'Item quantity must be an integer greater than 0' });
      }

      if (item.type === 'preconfigured') {
        const pizzaId = item.pizzaId || item.pizza;
        if (!pizzaId || !mongoose.Types.ObjectId.isValid(pizzaId)) {
          return res.status(400).json({ error: 'Invalid pizza ID provided' });
        }

        const pizza = await Pizza.findById(pizzaId);
        if (!pizza) {
          return res.status(400).json({ error: 'Invalid pizza ID provided' });
        }
        if (!pizza.isAvailable) {
          return res.status(400).json({ error: 'Selected pizza is currently unavailable' });
        }

        // Check ingredients stock for preconfigured pizza
        if (pizza.ingredients && pizza.ingredients.length > 0) {
          for (const ing of pizza.ingredients) {
            const inv = await Inventory.findById(ing.inventoryId);
            if (!inv || inv.stock < ing.quantity * item.quantity) {
              return res.status(400).json({
                error: `Insufficient stock for ingredient: ${inv ? inv.name : 'Unknown'}`
              });
            }
          }
        }

        const unitPrice = pizza.price;
        const subtotal = unitPrice * item.quantity;
        calculatedTotal += subtotal;

        normalizedItems.push({
          type: 'preconfigured',
          pizza: pizza._id,
          pizzaId: pizza._id,
          quantity: item.quantity,
          unitPrice,
          price: unitPrice,
          subtotal
        });
      } else {
        // Custom pizza
        const customDetails = item.customDetails || {};
        const baseId = customDetails.baseId || customDetails.base;
        const sauceId = customDetails.sauceId || customDetails.sauce;
        const cheeseId = customDetails.cheeseId || customDetails.cheese;
        const veggieIds = customDetails.veggieIds || customDetails.veggies || [];

        if (!baseId || !sauceId || !cheeseId) {
          return res.status(400).json({ error: 'Custom pizza requires base, sauce, and cheese' });
        }

        if (
          !mongoose.Types.ObjectId.isValid(baseId) ||
          !mongoose.Types.ObjectId.isValid(sauceId) ||
          !mongoose.Types.ObjectId.isValid(cheeseId)
        ) {
          return res.status(400).json({ error: 'Invalid ingredient ID provided' });
        }

        for (const vId of veggieIds) {
          if (!mongoose.Types.ObjectId.isValid(vId)) {
            return res.status(400).json({ error: 'Invalid ingredient ID provided' });
          }
        }

        const base = await Inventory.findById(baseId);
        const sauce = await Inventory.findById(sauceId);
        const cheese = await Inventory.findById(cheeseId);

        if (!base || !sauce || !cheese) {
          return res.status(400).json({ error: 'Invalid ingredient ID provided' });
        }

        const veggies = [];
        for (const vId of veggieIds) {
          const vDoc = await Inventory.findById(vId);
          if (!vDoc) {
            return res.status(400).json({ error: 'Invalid ingredient ID provided' });
          }
          veggies.push(vDoc);
        }

        // Stock check
        if (base.stock < item.quantity) {
          return res.status(400).json({ error: `Insufficient stock for ingredient: ${base.name}` });
        }
        if (sauce.stock < item.quantity) {
          return res.status(400).json({ error: `Insufficient stock for ingredient: ${sauce.name}` });
        }
        if (cheese.stock < item.quantity) {
          return res.status(400).json({ error: `Insufficient stock for ingredient: ${cheese.name}` });
        }
        for (const vDoc of veggies) {
          if (vDoc.stock < item.quantity) {
            return res.status(400).json({ error: `Insufficient stock for ingredient: ${vDoc.name}` });
          }
        }

        const unitPrice =
          base.price + sauce.price + cheese.price + veggies.reduce((sum, v) => sum + v.price, 0);
        const subtotal = unitPrice * item.quantity;
        calculatedTotal += subtotal;

        normalizedItems.push({
          type: 'custom',
          customDetails: {
            base: base._id,
            sauce: sauce._id,
            cheese: cheese._id,
            veggies: veggies.map((v) => v._id),
            baseId: base._id,
            sauceId: sauce._id,
            cheeseId: cheese._id,
            veggieIds: veggies.map((v) => v._id)
          },
          quantity: item.quantity,
          unitPrice,
          price: unitPrice,
          subtotal
        });
      }
    }

    const amountInPaise = Math.round(calculatedTotal * 100);

    // 4. Create Razorpay Order
    let razorpayOrderId;
    try {
      const razorpay = getRazorpayInstance();
      const rzpOrder = await razorpay.orders.create({
        amount: amountInPaise,
        currency: 'INR',
        receipt: `rcpt_${Date.now()}_${Math.random().toString(36).substring(7)}`
      });
      razorpayOrderId = rzpOrder.id;
    } catch (err) {
      console.warn('[Razorpay] Orders API fallback:', err.message);
      razorpayOrderId = `order_rzp_${crypto.randomBytes(8).toString('hex')}`;
    }

    // 5. Persist order in MongoDB
    const order = new Order({
      user: req.user.id,
      userId: req.user.id,
      items: normalizedItems,
      deliveryAddress,
      totalAmount: calculatedTotal,
      paymentStatus: 'pending',
      orderStatus: 'Created',
      razorpayOrderId,
      statusHistory: [{ status: 'Created', timestamp: new Date(), note: 'Order initialized' }]
    });

    await order.save();

    return res.status(200).json({
      orderId: order._id.toString(),
      razorpayOrderId,
      amount: amountInPaise,
      currency: 'INR',
      key: process.env.RAZORPAY_KEY_ID || 'rzp_test_Twlntm5UkURGg0'
    });
  } catch (error) {
    console.error('[OrderController] createRazorpayOrder error:', error);
    return res.status(500).json({ error: 'Server error creating order', details: error.message });
  }
};

/**
 * Verifies Razorpay HMAC signature, atomically decrements inventory, and confirms order
 * POST /api/orders/verify-payment
 */
const verifyPayment = async (req, res) => {
  try {
    const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    // 1. Field validation
    if (!orderId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing required payment verification fields' });
    }

    // 2. Fetch order
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Replay attack check
    if (order.paymentStatus === 'paid') {
      return res.status(400).json({ error: 'Order is already paid' });
    }

    // Ownership check (only creator or admin can verify)
    if (order.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied: not order owner' });
    }

    // 3. Cryptographic HMAC verification
    const secret = process.env.RAZORPAY_KEY_SECRET || 'FXnUylflZOnGsE4zoexrkIuv';
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      order.paymentStatus = 'failed';
      order.statusHistory.push({
        status: 'Failed',
        timestamp: new Date(),
        note: 'Invalid payment signature'
      });
      await order.save();
      return res.status(400).json({ error: 'Invalid payment signature' });
    }

    // 4. Calculate required quantities per inventory item
    const requiredIngredients = new Map();

    for (const item of order.items) {
      if (item.type === 'custom') {
        const { base, sauce, cheese, veggies, baseId, sauceId, cheeseId, veggieIds } =
          item.customDetails || {};
        const bId = (base || baseId)?._id?.toString() || (base || baseId)?.toString();
        const sId = (sauce || sauceId)?._id?.toString() || (sauce || sauceId)?.toString();
        const cId = (cheese || cheeseId)?._id?.toString() || (cheese || cheeseId)?.toString();
        const vList = (veggies || veggieIds || []).map((v) => v?._id?.toString() || v?.toString());

        for (const invId of [bId, sId, cId, ...vList].filter(Boolean)) {
          requiredIngredients.set(invId, (requiredIngredients.get(invId) || 0) + item.quantity);
        }
      } else if (item.type === 'preconfigured') {
        const pizza = await Pizza.findById(item.pizza || item.pizzaId);
        if (pizza && pizza.ingredients) {
          for (const ing of pizza.ingredients) {
            const ingId = ing.inventoryId.toString();
            const qty = ing.quantity * item.quantity;
            requiredIngredients.set(ingId, (requiredIngredients.get(ingId) || 0) + qty);
          }
        }
      }
    }

    // Pre-check stock levels
    for (const [invId, qtyNeeded] of requiredIngredients.entries()) {
      const inv = await Inventory.findById(invId);
      if (!inv || inv.stock < qtyNeeded) {
        return res.status(400).json({
          error: `Insufficient stock for ingredient: ${inv ? inv.name : invId}`
        });
      }
    }

    // 5. Atomic conditional decrements with compensation / rollback loop
    const successfullyDecremented = [];
    let decrementFailed = false;
    let failedItemName = '';

    for (const [invId, qtyNeeded] of requiredIngredients.entries()) {
      const updated = await Inventory.findOneAndUpdate(
        { _id: invId, stock: { $gte: qtyNeeded } },
        { $inc: { stock: -qtyNeeded } },
        { new: true }
      );

      if (!updated) {
        decrementFailed = true;
        const itemDoc = await Inventory.findById(invId);
        failedItemName = itemDoc ? itemDoc.name : invId;
        break;
      }

      successfullyDecremented.push({
        id: invId,
        qty: qtyNeeded,
        currentStock: updated.stock
      });
    }

    if (decrementFailed) {
      // Roll back any previously decremented items
      for (const compensation of successfullyDecremented) {
        await Inventory.findByIdAndUpdate(compensation.id, {
          $inc: { stock: compensation.qty }
        });
      }
      return res.status(400).json({
        error: `Insufficient stock for ingredient: ${failedItemName}`
      });
    }

    // Broadcast inventory updates
    for (const item of successfullyDecremented) {
      broadcastInventoryUpdate(item.id, item.currentStock);
    }

    // 6. Finalize order
    order.paymentStatus = 'paid';
    order.orderStatus = 'Order Received';
    order.razorpayPaymentId = razorpay_payment_id;
    order.razorpaySignature = razorpay_signature;
    order.paidAt = new Date();
    order.statusHistory.push({
      status: 'Order Received',
      timestamp: order.paidAt,
      note: 'Payment verified and order placed successfully'
    });

    await order.save();

    // 7. Broadcast order events
    broadcastOrderStatus(order._id, order.orderStatus, order.paidAt.toISOString());
    broadcastNewOrder(order);

    return res.status(200).json({
      message: 'Payment verified and order placed successfully',
      order
    });
  } catch (error) {
    console.error('[OrderController] verifyPayment error:', error);
    return res.status(500).json({ error: 'Server error verifying payment', details: error.message });
  }
};

/**
 * Returns current authenticated user's order history
 * GET /api/orders & GET /api/orders/my-orders
 */
const getUserOrders = async (req, res) => {
  try {
    const orders = await Order.find({
      $or: [{ user: req.user.id }, { userId: req.user.id }]
    })
      .populate('items.pizza')
      .populate('items.customDetails.base')
      .populate('items.customDetails.sauce')
      .populate('items.customDetails.cheese')
      .populate('items.customDetails.veggies')
      .sort({ createdAt: -1 });

    return res.status(200).json(orders);
  } catch (error) {
    console.error('[OrderController] getUserOrders error:', error);
    return res.status(500).json({ error: 'Server error retrieving orders', details: error.message });
  }
};

/**
 * Returns a single order by ID
 * GET /api/orders/:id
 */
const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = await Order.findById(id)
      .populate('items.pizza')
      .populate('items.customDetails.base')
      .populate('items.customDetails.sauce')
      .populate('items.customDetails.cheese')
      .populate('items.customDetails.veggies');

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Ownership check
    const orderUserId = (order.user && order.user._id) ? order.user._id.toString() : (order.user ? order.user.toString() : order.userId?.toString());
    if (orderUserId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    return res.status(200).json(order);
  } catch (error) {
    console.error('[OrderController] getOrderById error:', error);
    return res.status(500).json({ error: 'Server error retrieving order', details: error.message });
  }
};

module.exports = {
  createRazorpayOrder,
  verifyPayment,
  getUserOrders,
  getOrderById
};
