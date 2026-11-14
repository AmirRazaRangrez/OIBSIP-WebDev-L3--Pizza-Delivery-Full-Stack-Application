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

// Network diagnostic tool to inspect live cloud outbound port filtering
const net = require('net');

const testTcpConnection = (host, port, timeout = 4000) => {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    let isResolved = false;

    socket.setTimeout(timeout);

    socket.on('connect', () => {
      if (!isResolved) {
        isResolved = true;
        const latency = Date.now() - start;
        socket.destroy();
        resolve({ host, port, status: 'OPEN', latencyMs: latency });
      }
    });

    socket.on('timeout', () => {
      if (!isResolved) {
        isResolved = true;
        socket.destroy();
        resolve({ host, port, status: 'BLOCKED_TIMEOUT', error: `Firewall dropped packet (timed out after ${timeout}ms)` });
      }
    });

    socket.on('error', (err) => {
      if (!isResolved) {
        isResolved = true;
        socket.destroy();
        resolve({ host, port, status: 'ERROR', error: err.message });
      }
    });

    socket.connect(port, host);
  });
};

router.post('/diagnose-network', protect, requireAdmin, async (req, res) => {
  const targets = [
    { host: 'smtp.gmail.com', port: 465 },
    { host: 'smtp.gmail.com', port: 587 },
    { host: 'api.resend.com', port: 443 },
    { host: 'api.brevo.com', port: 443 }
  ];

  const results = await Promise.all(targets.map(t => testTcpConnection(t.host, t.port)));
  return res.status(200).json({
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    results
  });
});

router.post('/send-live-test-email', protect, requireAdmin, async (req, res) => {
  try {
    const to = req.body.to || 'bydominalhotelcitypark@gmail.com';
    const emailService = require('../services/emailService');
    const result = await emailService.sendVerificationEmail(to, 'Test Recipient', 'live-test-token-777', req.get('origin'));
    return res.status(200).json({
      success: !result?.error,
      result,
      smtpReady: emailService.smtpReady,
      lastError: emailService.lastError
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
      stack: err.stack
    });
  }
});

module.exports = router;
