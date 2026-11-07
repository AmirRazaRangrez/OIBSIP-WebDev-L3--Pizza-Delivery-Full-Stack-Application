// e2e_tests/mock-server/mockDb.js
import crypto from 'node:crypto';

export class MockDatabase {
  constructor() {
    this.reset();
  }

  reset() {
    this.users = [];
    this.verificationTokens = new Map();
    this.resetTokens = new Map();
    this.inventory = [];
    this.orders = [];
    this.preConfiguredPizzas = [];
    this.seed();
  }

  seed() {
    // Seed Admin
    this.users.push({
      _id: 'admin_001',
      name: 'System Admin',
      email: 'admin@pizzadelivery.com',
      passwordHash: 'hashed_AdminPassword123!',
      role: 'admin',
      isVerified: true,
      createdAt: new Date().toISOString()
    });

    // Seed 5 Bases
    const bases = [
      { name: 'Thin Crust', category: 'base', stock: 50, threshold: 20, price: 120 },
      { name: 'Cheese Burst', category: 'base', stock: 40, threshold: 20, price: 180 },
      { name: 'Pan Pizza', category: 'base', stock: 45, threshold: 20, price: 140 },
      { name: 'Wheat Thin Crust', category: 'base', stock: 35, threshold: 20, price: 150 },
      { name: 'Stuffed Crust', category: 'base', stock: 30, threshold: 20, price: 190 }
    ];

    // Seed 5 Sauces
    const sauces = [
      { name: 'Classic Tomato', category: 'sauce', stock: 60, threshold: 15, price: 40 },
      { name: 'Spicy Marinara', category: 'sauce', stock: 50, threshold: 15, price: 50 },
      { name: 'Smoky BBQ', category: 'sauce', stock: 45, threshold: 15, price: 55 },
      { name: 'White Garlic Parmesan', category: 'sauce', stock: 40, threshold: 15, price: 60 },
      { name: 'Basil Pesto', category: 'sauce', stock: 35, threshold: 15, price: 65 }
    ];

    // Seed Cheeses
    const cheeses = [
      { name: 'Mozzarella', category: 'cheese', stock: 80, threshold: 25, price: 70 },
      { name: 'Cheddar Blend', category: 'cheese', stock: 50, threshold: 20, price: 85 },
      { name: 'Parmesan Reggiano', category: 'cheese', stock: 40, threshold: 15, price: 95 }
    ];

    // Seed Veggies
    const veggies = [
      { name: 'Button Mushrooms', category: 'veggie', stock: 60, threshold: 20, price: 35 },
      { name: 'Red Onions', category: 'veggie', stock: 70, threshold: 20, price: 25 },
      { name: 'Bell Peppers', category: 'veggie', stock: 65, threshold: 20, price: 30 },
      { name: 'Black Olives', category: 'veggie', stock: 55, threshold: 15, price: 45 },
      { name: 'Pickled Jalapenos', category: 'veggie', stock: 50, threshold: 15, price: 40 },
      { name: 'Roma Tomatoes', category: 'veggie', stock: 60, threshold: 20, price: 25 }
    ];

    let idCounter = 1;
    for (const item of [...bases, ...sauces, ...cheeses, ...veggies]) {
      this.inventory.push({
        _id: `inv_${String(idCounter++).padStart(3, '0')}`,
        ...item
      });
    }

    // Seed pre-configured pizzas
    this.preConfiguredPizzas = [
      {
        _id: 'pizza_001',
        name: 'Margherita Classic',
        description: 'Classic cheese and fresh tomato sauce',
        price: 299,
        category: 'preconfigured',
        image: '/images/margherita.jpg',
        stock: 25,
        ingredients: ['Thin Crust', 'Classic Tomato', 'Mozzarella']
      },
      {
        _id: 'pizza_002',
        name: 'Farmhouse Special',
        description: 'Loaded with crisp onions, bell peppers, and mushrooms',
        price: 399,
        category: 'preconfigured',
        image: '/images/farmhouse.jpg',
        stock: 20,
        ingredients: ['Pan Pizza', 'Spicy Marinara', 'Mozzarella', 'Button Mushrooms', 'Bell Peppers', 'Red Onions']
      },
      {
        _id: 'pizza_003',
        name: 'Veggie Supreme',
        description: 'Black olives, jalapenos, bell peppers and cheddar blend',
        price: 449,
        category: 'preconfigured',
        image: '/images/veggie_supreme.jpg',
        stock: 15,
        ingredients: ['Cheese Burst', 'Classic Tomato', 'Cheddar Blend', 'Black Olives', 'Pickled Jalapenos']
      }
    ];
  }
}

export const mockDb = new MockDatabase();
export default mockDb;

