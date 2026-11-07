const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Inventory item name is required'],
      trim: true,
      unique: true,
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      enum: {
        values: ['base', 'sauce', 'cheese', 'veggie'],
        message: '{VALUE} is not a valid inventory category',
      },
      index: true,
    },
    stock: {
      type: Number,
      required: [true, 'Stock quantity is required'],
      min: [0, 'Stock cannot be negative'],
      default: 0,
    },
    threshold: {
      type: Number,
      required: [true, 'Alert threshold is required'],
      min: [0, 'Threshold cannot be negative'],
      default: 20,
    },
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: [0, 'Price cannot be negative'],
      default: 0,
    },
    image: {
      type: String,
      default: '',
    },
    description: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual to determine real-time availability
inventorySchema.virtual('isAvailable').get(function () {
  return this.stock > 0;
});

// Composite index for fast category filtering and sorting
inventorySchema.index({ category: 1, name: 1 });

const Inventory = mongoose.model('Inventory', inventorySchema);

module.exports = Inventory;
