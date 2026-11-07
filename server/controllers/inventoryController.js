const Inventory = require('../models/Inventory');

/**
 * @desc    Get all inventory items (optional filtering by category or inStock)
 * @route   GET /api/inventory
 * @access  Public
 */
const getAllInventory = async (req, res) => {
  try {
    const { category, inStock } = req.query;
    const filter = {};

    if (category) {
      filter.category = category;
    }
    if (inStock === 'true') {
      filter.stock = { $gt: 0 };
    }

    const items = await Inventory.find(filter).sort({ category: 1, name: 1 });
    res.status(200).json(items);
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving inventory', error: error.message });
  }
};

/**
 * @desc    Get inventory grouped by category for the 4-step pizza builder
 * @route   GET /api/inventory/grouped
 * @access  Public
 */
const getGroupedInventory = async (req, res) => {
  try {
    const items = await Inventory.find({}).sort({ name: 1 });

    const grouped = {
      bases: [],
      sauces: [],
      cheeses: [],
      veggies: [],
    };

    items.forEach((item) => {
      switch (item.category) {
        case 'base':
          grouped.bases.push(item);
          break;
        case 'sauce':
          grouped.sauces.push(item);
          break;
        case 'cheese':
          grouped.cheeses.push(item);
          break;
        case 'veggie':
          grouped.veggies.push(item);
          break;
        default:
          break;
      }
    });

    res.status(200).json(grouped);
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving grouped inventory', error: error.message });
  }
};

/**
 * @desc    Update inventory stock level and threshold
 * @route   PUT /api/inventory/:id/stock
 * @access  Private/Admin
 */
const updateStock = async (req, res) => {
  try {
    const { id } = req.params;
    const { stock, threshold } = req.body;

    if (stock === undefined && threshold === undefined) {
      return res.status(400).json({ message: 'Stock or threshold value is required' });
    }

    if (stock !== undefined && (typeof stock !== 'number' || stock < 0)) {
      return res.status(400).json({ message: 'Stock must be a non-negative number' });
    }

    if (threshold !== undefined && (typeof threshold !== 'number' || threshold < 0)) {
      return res.status(400).json({ message: 'Threshold must be a non-negative number' });
    }

    const item = await Inventory.findById(id);
    if (!item) {
      return res.status(404).json({ message: 'Inventory item not found' });
    }

    if (stock !== undefined) item.stock = stock;
    if (threshold !== undefined) item.threshold = threshold;

    const updatedItem = await item.save();

    // Broadcast WebSocket update if Socket.io is attached
    const io = (req.app && req.app.get('io')) || req.io;
    if (io) {
      io.emit('inventory_updated', {
        inventoryId: updatedItem._id,
        currentStock: updatedItem.stock,
        threshold: updatedItem.threshold,
        isAvailable: updatedItem.isAvailable,
      });
    }

    res.status(200).json({
      message: 'Stock updated successfully',
      item: updatedItem,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error updating stock', error: error.message });
  }
};

module.exports = {
  getAllInventory,
  getGroupedInventory,
  updateStock,
};
