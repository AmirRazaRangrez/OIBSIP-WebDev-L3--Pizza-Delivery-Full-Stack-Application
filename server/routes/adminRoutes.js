const express = require('express');
const router = express.Router();
const adminAuthController = require('../controllers/adminAuthController');
const User = require('../models/User');
const Order = require('../models/Order');
const { protect } = require('../middleware/authMiddleware');
const { requireAdmin } = require('../middleware/adminMiddleware');

// Dedicated isolated admin login
router.post('/auth/login', adminAuthController.adminLogin);

// Protected admin profile check
router.get('/auth/me', protect, requireAdmin, adminAuthController.getAdminMe);

// Admin user management: list consumers & delete consumers for testing
router.get('/users', protect, requireAdmin, async (req, res, next) => {
  try {
    const users = await User.find({}).select('-password');
    return res.status(200).json({
      success: true,
      count: users.length,
      users
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/users', protect, requireAdmin, async (req, res, next) => {
  try {
    const { email, deleteOrders = true } = req.body || {};
    let query = { role: { $ne: 'admin' } };
    if (email && typeof email === 'string' && email.trim() !== '') {
      query = { email: email.toLowerCase().trim(), role: { $ne: 'admin' } };
    }

    const usersToDelete = await User.find(query);
    const userIds = usersToDelete.map(u => u._id);

    const result = await User.deleteMany(query);

    let deletedOrdersCount = 0;
    if (deleteOrders && userIds.length > 0) {
      const orderResult = await Order.deleteMany({
        $or: [{ user: { $in: userIds } }, { userId: { $in: userIds } }]
      });
      deletedOrdersCount = orderResult.deletedCount;
    }

    return res.status(200).json({
      success: true,
      message: `Deleted ${result.deletedCount} consumer account(s). Admin account preserved.${deletedOrdersCount ? ` Also removed ${deletedOrdersCount} test order(s).` : ''}`,
      deletedCount: result.deletedCount,
      deletedOrdersCount
    });
  } catch (error) {
    next(error);
  }
});

// Admin order management routes
router.use('/orders', require('./adminOrderRoutes'));

module.exports = router;
