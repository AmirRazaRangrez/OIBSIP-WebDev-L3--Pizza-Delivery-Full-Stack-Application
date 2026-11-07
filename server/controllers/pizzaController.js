const Pizza = require('../models/Pizza');

/**
 * @desc    Get all preconfigured pizzas for catalog display
 * @route   GET /api/pizzas
 * @access  Public
 */
const getPizzas = async (req, res) => {
  try {
    const pizzas = await Pizza.find({ isPreconfigured: true, isAvailable: true })
      .populate('ingredients.inventoryId', 'name category stock price')
      .sort({ price: 1 });
    res.status(200).json(pizzas);
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving pizzas', error: error.message });
  }
};

/**
 * @desc    Get single pizza by ID
 * @route   GET /api/pizzas/:id
 * @access  Public
 */
const getPizzaById = async (req, res) => {
  try {
    const pizza = await Pizza.findById(req.params.id).populate('ingredients.inventoryId');
    if (!pizza) {
      return res.status(404).json({ message: 'Pizza not found' });
    }
    res.status(200).json(pizza);
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving pizza', error: error.message });
  }
};

module.exports = {
  getPizzas,
  getPizzaById,
};
