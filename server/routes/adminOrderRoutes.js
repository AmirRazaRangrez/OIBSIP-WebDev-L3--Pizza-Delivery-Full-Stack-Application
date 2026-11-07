const express = require('express');
const router = express.Router();
const adminOrderController = require('../controllers/adminOrderController');
const { protect } = require('../middleware/authMiddleware');
const { requireAdmin } = require('../middleware/adminMiddleware');

router.use(protect, requireAdmin);

router.get('/', adminOrderController.getAllOrders);
router.patch('/:id/status', adminOrderController.updateOrderStatus);

module.exports = router;
