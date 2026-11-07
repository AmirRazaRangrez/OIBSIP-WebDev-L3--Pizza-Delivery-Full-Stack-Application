const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { protect } = require('../middleware/authMiddleware');

// All order routes require authentication
router.use(protect);

router.post('/create-razorpay-order', orderController.createRazorpayOrder);
router.post('/verify-payment', orderController.verifyPayment);
router.get('/', orderController.getUserOrders);
router.get('/my-orders', orderController.getUserOrders);
router.get('/:id', orderController.getOrderById);

module.exports = router;
