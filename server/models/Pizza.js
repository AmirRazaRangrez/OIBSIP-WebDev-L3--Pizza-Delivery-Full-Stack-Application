const mongoose = require('mongoose');

const pizzaIngredientSchema = new mongoose.Schema(
  {
    inventoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Inventory',
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      enum: ['base', 'sauce', 'cheese', 'veggie'],
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
    },
  },
  { _id: false }
);

const pizzaSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Pizza name is required'],
      trim: true,
      unique: true,
    },
    description: {
      type: String,
      required: [true, 'Pizza description is required'],
    },
    price: {
      type: Number,
      required: [true, 'Pizza price is required'],
      min: [0, 'Price cannot be negative'],
    },
    image: {
      type: String,
      default: '/images/default-pizza.png',
    },
    isPreconfigured: {
      type: Boolean,
      default: true,
    },
    ingredients: [pizzaIngredientSchema],
    isVegetarian: {
      type: Boolean,
      default: true,
    },
    isAvailable: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

pizzaSchema.index({ isPreconfigured: 1, isAvailable: 1 });

const Pizza = mongoose.model('Pizza', pizzaSchema);

module.exports = Pizza;
