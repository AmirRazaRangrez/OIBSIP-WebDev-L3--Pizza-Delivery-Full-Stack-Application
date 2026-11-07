const express = require('express');
const router = express.Router();
const adminAuthController = require('../controllers/adminAuthController');
const { protect } = require('../middleware/authMiddleware');
const { requireAdmin } = require('../middleware/adminMiddleware');

// Dedicated isolated admin login
router.post('/auth/login', adminAuthController.adminLogin);

// Protected admin profile check
router.get('/auth/me', protect, requireAdmin, adminAuthController.getAdminMe);

// Admin order management routes
router.use('/orders', require('./adminOrderRoutes'));

module.exports = router;
