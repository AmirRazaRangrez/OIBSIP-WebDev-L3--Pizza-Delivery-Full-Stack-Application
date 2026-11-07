const mongoose = require('mongoose');
const Order = require('../models/Order');
const { broadcastOrderStatus } = require('../socket');

/**
 * Returns all customer orders with populate and filtering
 * GET /api/admin/orders
 */
const getAllOrders = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) {
      filter.orderStatus = req.query.status;
    }
    if (req.query.orderStatus) {
      filter.orderStatus = req.query.orderStatus;
    }
    if (req.query.paymentStatus) {
      filter.paymentStatus = req.query.paymentStatus;
    }

    let query = Order.find(filter)
      .sort({ createdAt: -1 })
      .populate('user', 'name email role')
      .populate('userId', 'name email role')
      .populate('items.pizza')
      .populate('items.pizzaId')
      .populate('items.customDetails.base')
      .populate('items.customDetails.baseId')
      .populate('items.customDetails.sauce')
      .populate('items.customDetails.sauceId')
      .populate('items.customDetails.cheese')
      .populate('items.customDetails.cheeseId')
      .populate('items.customDetails.veggies')
      .populate('items.customDetails.veggieIds');

    if (req.query.page && req.query.limit) {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 10;
      query = query.skip((page - 1) * limit).limit(limit);
    }

    const orders = await query;
    return res.status(200).json(orders);
  } catch (error) {
    console.error('[AdminOrderController] getAllOrders error:', error);
    return res.status(500).json({ error: 'Server error retrieving admin orders', details: error.message });
  }
};

/**
 * Updates order status with strict transition validation
 * PATCH /api/admin/orders/:id/status
 */
const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || typeof status !== 'string') {
      return res.status(400).json({ error: 'Status is required and must be a string' });
    }

    const validStatuses = ['Order Received', 'In Kitchen', 'Sent to Delivery', 'Delivered'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Valid: ${validStatuses.join(', ')}`
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Prevent regression from Delivered
    if (order.orderStatus === 'Delivered' && status !== 'Delivered') {
      return res.status(400).json({ error: 'Cannot change status of already delivered order' });
    }

    order.orderStatus = status;
    order.statusHistory.push({
      status,
      timestamp: new Date(),
      note: 'Status updated by admin',
      updatedBy: req.user.id
    });

    await order.save();

    // Broadcast status update
    broadcastOrderStatus(order._id, order.orderStatus, order.updatedAt ? order.updatedAt.toISOString() : new Date().toISOString());

    return res.status(200).json({
      message: 'Order status updated successfully',
      order
    });
  } catch (error) {
    console.error('[AdminOrderController] updateOrderStatus error:', error);
    return res.status(500).json({ error: 'Server error updating order status', details: error.message });
  }
};

module.exports = {
  getAllOrders,
  updateOrderStatus
};
