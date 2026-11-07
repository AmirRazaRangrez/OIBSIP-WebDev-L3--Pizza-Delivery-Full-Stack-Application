const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: {
        values: ['custom', 'preconfigured'],
        message: '{VALUE} is not a valid item type'
      },
      required: [true, 'Item type is required'],
      default: 'custom'
    },
    // Reference for preconfigured pizzas
    pizza: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Pizza',
      default: null
    },
    pizzaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Pizza',
      default: null
    },
    // Custom pizza ingredient configuration
    customDetails: {
      base: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Inventory',
        default: null
      },
      sauce: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Inventory',
        default: null
      },
      cheese: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Inventory',
        default: null
      },
      veggies: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Inventory'
        }
      ],
      // Convenience aliases matching client payload
      baseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Inventory',
        default: null
      },
      sauceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Inventory',
        default: null
      },
      cheeseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Inventory',
        default: null
      },
      veggieIds: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Inventory'
        }
      ]
    },
    quantity: {
      type: Number,
      required: [true, 'Item quantity is required'],
      min: [1, 'Quantity must be at least 1'],
      default: 1
    },
    unitPrice: {
      type: Number,
      required: false,
      min: [0, 'Unit price cannot be negative']
    },
    price: {
      type: Number,
      required: false,
      min: [0, 'Price cannot be negative']
    },
    subtotal: {
      type: Number,
      required: false,
      min: [0, 'Subtotal cannot be negative']
    }
  },
  { _id: true }
);

// Synchronize unitPrice and price
orderItemSchema.pre('validate', function (next) {
  if (this.unitPrice !== undefined && this.price === undefined) {
    this.price = this.unitPrice;
  } else if (this.price !== undefined && this.unitPrice === undefined) {
    this.unitPrice = this.price;
  }
  if (this.unitPrice !== undefined && this.subtotal === undefined) {
    this.subtotal = this.unitPrice * (this.quantity || 1);
  }
  next();
});

const statusHistorySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      required: true,
      enum: ['Created', 'Order Received', 'In Kitchen', 'Sent to Delivery', 'Delivered', 'Failed']
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    note: {
      type: String,
      default: ''
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Order must belong to a user'],
      index: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },
    items: {
      type: [orderItemSchema],
      required: [true, 'Order must contain at least one item'],
      validate: {
        validator: function (v) {
          return Array.isArray(v) && v.length > 0;
        },
        message: 'Order items array cannot be empty'
      }
    },
    totalAmount: {
      type: Number,
      required: [true, 'Total amount is required'],
      min: [0, 'Total amount cannot be negative']
    },
    deliveryAddress: {
      type: mongoose.Schema.Types.Mixed,
      required: [true, 'Delivery address is required'],
      validate: {
        validator: function (val) {
          if (!val) return false;
          if (typeof val === 'string') return val.trim().length > 0;
          if (typeof val === 'object') {
            return Boolean(val.street && String(val.street).trim().length > 0);
          }
          return false;
        },
        message: 'Delivery address must be a non-empty string or address object'
      }
    },
    paymentStatus: {
      type: String,
      enum: {
        values: ['pending', 'paid', 'failed'],
        message: '{VALUE} is not a valid payment status'
      },
      default: 'pending',
      index: true
    },
    orderStatus: {
      type: String,
      enum: {
        values: ['Created', 'Order Received', 'In Kitchen', 'Sent to Delivery', 'Delivered'],
        message: '{VALUE} is not a valid order status'
      },
      default: 'Created',
      index: true
    },
    razorpayOrderId: {
      type: String,
      required: [true, 'Razorpay Order ID is required'],
      unique: true,
      index: true
    },
    razorpayPaymentId: {
      type: String,
      default: null,
      index: true
    },
    razorpaySignature: {
      type: String,
      default: null
    },
    paidAt: {
      type: Date,
      default: null
    },
    statusHistory: {
      type: [statusHistorySchema],
      default: () => [{ status: 'Created', timestamp: new Date(), note: 'Order initialized' }]
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Ensure user and userId are synchronized
orderSchema.pre('validate', function (next) {
  if (this.user && !this.userId) {
    this.userId = this.user;
  } else if (this.userId && !this.user) {
    this.user = this.userId;
  }
  next();
});

// Virtual getter for userId compatibility if user is populated
orderSchema.virtual('userIdentifier').get(function () {
  return (this.user && this.user._id) ? this.user._id.toString() : this.user?.toString();
});

// Indexes for query performance
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ orderStatus: 1, createdAt: -1 });
orderSchema.index({ paymentStatus: 1, createdAt: -1 });

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;
