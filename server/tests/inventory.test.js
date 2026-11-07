const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const Inventory = require('../models/Inventory');
const Pizza = require('../models/Pizza');
const User = require('../models/User');

describe('Inventory & Pizza API Suite (M1)', () => {
  let adminToken;
  let userToken;
  let sampleBase;

  beforeEach(async () => {
    // 1. Create Admin User & Generate Token
    const admin = await User.create({
      name: 'Admin Tester',
      email: 'admin@test.com',
      password: 'HashedPassword123!',
      role: 'admin',
      isVerified: true,
    });
    adminToken = jwt.sign(
      { id: admin._id, email: admin.email, role: admin.role },
      process.env.JWT_SECRET || 'test_jwt_secret_key_12345',
      { expiresIn: '1h' }
    );

    // 2. Create Regular User & Generate Token
    const user = await User.create({
      name: 'Regular Customer',
      email: 'user@test.com',
      password: 'HashedPassword123!',
      role: 'user',
      isVerified: true,
    });
    userToken = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'test_jwt_secret_key_12345',
      { expiresIn: '1h' }
    );

    // 3. Seed Sample Inventory (5 bases, 5 sauces, cheeses, veggies)
    const bases = [
      { name: 'Thin Crust', category: 'base', stock: 50, threshold: 20, price: 60 },
      { name: 'Thick Crust', category: 'base', stock: 50, threshold: 20, price: 70 },
      { name: 'Cheese Burst', category: 'base', stock: 50, threshold: 20, price: 110 },
      { name: 'Flatbread', category: 'base', stock: 50, threshold: 20, price: 80 },
      { name: 'Gluten-Free Crust', category: 'base', stock: 50, threshold: 20, price: 95 },
    ];
    const sauces = [
      { name: 'Classic Marinara', category: 'sauce', stock: 50, threshold: 20, price: 30 },
      { name: 'Spicy Peri-Peri', category: 'sauce', stock: 50, threshold: 20, price: 40 },
      { name: 'Creamy Alfredo', category: 'sauce', stock: 50, threshold: 20, price: 45 },
      { name: 'BBQ Tangy', category: 'sauce', stock: 50, threshold: 20, price: 35 },
      { name: 'Pesto Green', category: 'sauce', stock: 50, threshold: 20, price: 50 },
    ];
    const cheeses = [
      { name: 'Mozzarella', category: 'cheese', stock: 50, threshold: 20, price: 60 },
      { name: 'Cheddar', category: 'cheese', stock: 50, threshold: 20, price: 70 },
    ];
    const veggies = [
      { name: 'Bell Peppers', category: 'veggie', stock: 50, threshold: 20, price: 30 },
      { name: 'Mushrooms', category: 'veggie', stock: 50, threshold: 20, price: 35 },
      { name: 'Onions', category: 'veggie', stock: 50, threshold: 20, price: 20 },
    ];

    const insertedBases = await Inventory.insertMany(bases);
    await Inventory.insertMany([...sauces, ...cheeses, ...veggies]);
    sampleBase = insertedBases[0];

    // 4. Seed Pizza
    await Pizza.create({
      name: 'Margherita',
      description: 'Classic cheese and tomato',
      price: 279,
      isPreconfigured: true,
      ingredients: [
        { inventoryId: sampleBase._id, name: sampleBase.name, category: 'base', quantity: 1 },
      ],
    });
  });

  describe('GET /api/inventory', () => {
    it('should return 200 with all inventory items', async () => {
      const res = await request(app).get('/api/inventory');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(15); // 5 bases + 5 sauces + 2 cheeses + 3 veggies
    });

    it('should filter by category when query param is provided', async () => {
      const res = await request(app).get('/api/inventory?category=base');
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(5);
      expect(res.body.every((i) => i.category === 'base')).toBe(true);
    });
  });

  describe('GET /api/inventory/grouped', () => {
    it('should return grouped inventory with exactly 5 bases and 5 sauces', async () => {
      const res = await request(app).get('/api/inventory/grouped');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('bases');
      expect(res.body).toHaveProperty('sauces');
      expect(res.body).toHaveProperty('cheeses');
      expect(res.body).toHaveProperty('veggies');

      expect(res.body.bases.length).toBe(5);
      expect(res.body.sauces.length).toBe(5);
      expect(res.body.cheeses.length).toBe(2);
      expect(res.body.veggies.length).toBe(3);
    });
  });

  describe('PUT /api/inventory/:id/stock', () => {
    it('should reject unauthenticated request with 401', async () => {
      const res = await request(app)
        .put(`/api/inventory/${sampleBase._id}/stock`)
        .send({ stock: 75 });
      expect(res.status).toBe(401);
    });

    it('should reject non-admin user with 403 Forbidden', async () => {
      const res = await request(app)
        .put(`/api/inventory/${sampleBase._id}/stock`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ stock: 75 });
      expect(res.status).toBe(403);
    });

    it('should allow admin to update stock and threshold', async () => {
      const res = await request(app)
        .put(`/api/inventory/${sampleBase._id}/stock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ stock: 85, threshold: 25 });

      expect(res.status).toBe(200);
      expect(res.body.item.stock).toBe(85);
      expect(res.body.item.threshold).toBe(25);

      const dbCheck = await Inventory.findById(sampleBase._id);
      expect(dbCheck.stock).toBe(85);
      expect(dbCheck.threshold).toBe(25);
    });

    it('should return 400 for negative stock', async () => {
      const res = await request(app)
        .put(`/api/inventory/${sampleBase._id}/stock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ stock: -10 });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/pizzas', () => {
    it('should return 200 with list of preconfigured pizzas', async () => {
      const res = await request(app).get('/api/pizzas');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(1);
      expect(res.body[0].name).toBe('Margherita');
    });
  });
});
