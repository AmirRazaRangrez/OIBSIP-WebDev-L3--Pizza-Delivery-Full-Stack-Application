const express = require('express');
const router = express.Router();
const {
  getAllInventory,
  getGroupedInventory,
  updateStock,
} = require('../controllers/inventoryController');
const { protect } = require('../middleware/authMiddleware');
const { requireAdmin } = require('../middleware/adminMiddleware');

// Public routes for user pizza customizer & dashboard
router.get('/', getAllInventory);
router.get('/grouped', getGroupedInventory);

// Admin-only route for manual stock adjustment
router.put('/:id/stock', protect, requireAdmin, updateStock);

module.exports = router;
