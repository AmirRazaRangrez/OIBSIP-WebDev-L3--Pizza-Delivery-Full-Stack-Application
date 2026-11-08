const mongoose = require('mongoose');
const Pizza = require('../models/Pizza');

const fallbackPizzas = [
  {
    _id: '661000000000000000000001',
    name: 'Margherita',
    description: 'Classic Neapolitan delight with aromatic Marinara sauce, whole milk Mozzarella, and fresh herbs on our crisp Thin Crust.',
    price: 279,
    image: '/images/margherita.jpg',
    isPreconfigured: true,
    isVegetarian: true,
    ingredients: []
  },
  {
    _id: '661000000000000000000002',
    name: 'Farmhouse',
    description: 'Loaded with fresh crunchy Bell Peppers, earthy Mushrooms, crisp Onions, and juicy Tomatoes over Classic Marinara and melted Mozzarella on Thick Crust.',
    price: 429,
    image: '/images/farmhouse.jpg',
    isPreconfigured: true,
    isVegetarian: true,
    ingredients: []
  },
  {
    _id: '661000000000000000000003',
    name: 'Paneer Feast',
    description: 'Indulgent spicy feast featuring fiery Spicy Peri-Peri sauce, molten Cheese Burst crust, Mozzarella, Bell Peppers, and hot Jalapenos.',
    price: 479,
    image: '/images/paneer-feast.jpg',
    isPreconfigured: true,
    isVegetarian: true,
    ingredients: []
  },
  {
    _id: '661000000000000000000004',
    name: 'Veggie Supreme',
    description: 'The ultimate garden pizza on artisan Flatbread with smoky BBQ sauce, aged Cheddar, Black Olives, Sweet Corn, Mushrooms, and Bell Peppers.',
    price: 499,
    image: '/images/veggie-supreme.jpg',
    isPreconfigured: true,
    isVegetarian: true,
    ingredients: []
  }
];

/**
 * @desc    Get all preconfigured pizzas for catalog display
 * @route   GET /api/pizzas
 * @access  Public
 */
const getPizzas = async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(200).json(fallbackPizzas);
    }
    const pizzas = await Pizza.find({ isPreconfigured: true, isAvailable: true })
      .populate('ingredients.inventoryId', 'name category stock price')
      .sort({ price: 1 });
    if (!pizzas || pizzas.length === 0) {
      return res.status(200).json(fallbackPizzas);
    }
    res.status(200).json(pizzas);
  } catch (error) {
    console.warn('[PizzaController] Catalog query fallback:', error.message);
    res.status(200).json(fallbackPizzas);
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
