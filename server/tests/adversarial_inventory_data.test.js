const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const app = require('../server');
const Inventory = require('../models/Inventory');
const Pizza = require('../models/Pizza');
const User = require('../models/User');
const { seedDatabase, inventoryData } = require('../seed/seedData');

describe('Adversarial Inventory & Data Concurrency Stress Suite (M1)', () => {
  let adminToken;
  let userToken;
  let sampleBase;

  beforeEach(async () => {
    const currentSecret = process.env.JWT_SECRET || 'test_jwt_secret_key_12345';

    // 1. Create Admin User & Generate Token
    const admin = await User.create({
      name: 'Adversarial Admin',
      email: 'admin_adv@test.com',
      password: 'HashedPassword123!',
      role: 'admin',
      isVerified: true,
    });
    adminToken = jwt.sign(
      { id: admin._id, email: admin.email, role: admin.role },
      currentSecret,
      { expiresIn: '1h' }
    );

    // 2. Create Regular Consumer User & Generate Token
    const user = await User.create({
      name: 'Adversarial User',
      email: 'user_adv@test.com',
      password: 'HashedPassword123!',
      role: 'user',
      isVerified: true,
    });
    userToken = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      currentSecret,
      { expiresIn: '1h' }
    );

    // 3. Seed initial inventory
    sampleBase = await Inventory.create({
      name: 'Test Thin Crust',
      category: 'base',
      stock: 50,
      threshold: 20,
      price: 60,
    });

    await Inventory.create({
      name: 'Test Marinara',
      category: 'sauce',
      stock: 0, // out of stock
      threshold: 20,
      price: 30,
    });
  });

  // =========================================================================
  // 1. Hostile & Invalid Stock Updates
  // =========================================================================
  describe('1. Negative and Non-Numeric Stock Updates', () => {
    it('CHALLENGE-01: Rejects negative integer stock (-10) with 400', async () => {
      const res = await request(app)
        .put(`/api/inventory/${sampleBase._id}/stock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ stock: -10 });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/non-negative number/i);

      // Verify stock untouched
      const item = await Inventory.findById(sampleBase._id);
      expect(item.stock).toBe(50);
    });

    it('CHALLENGE-02: Rejects negative fractional stock (-0.01) with 400', async () => {
      const res = await request(app)
        .put(`/api/inventory/${sampleBase._id}/stock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ stock: -0.01 });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/non-negative number/i);
    });

    it('CHALLENGE-03: Rejects string non-numeric stock ("abc") with 400', async () => {
      const res = await request(app)
        .put(`/api/inventory/${sampleBase._id}/stock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ stock: 'abc' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/non-negative number/i);
    });

    it('CHALLENGE-04: Rejects string-formatted numeric stock ("100") with 400', async () => {
      const res = await request(app)
        .put(`/api/inventory/${sampleBase._id}/stock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ stock: '100' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/non-negative number/i);
    });

    it('CHALLENGE-05: Rejects null stock value with 400', async () => {
      const res = await request(app)
        .put(`/api/inventory/${sampleBase._id}/stock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ stock: null });

      expect(res.status).toBe(400);
    });

    it('CHALLENGE-06: Rejects boolean stock value with 400', async () => {
      const res = await request(app)
        .put(`/api/inventory/${sampleBase._id}/stock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ stock: true });

      expect(res.status).toBe(400);
    });

    it('CHALLENGE-07: Rejects array or object stock payloads with 400', async () => {
      const resArray = await request(app)
        .put(`/api/inventory/${sampleBase._id}/stock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ stock: [50] });
      expect(resArray.status).toBe(400);

      const resObj = await request(app)
        .put(`/api/inventory/${sampleBase._id}/stock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ stock: { amount: 50 } });
      expect(resObj.status).toBe(400);
    });

    it('CHALLENGE-08: Rejects negative threshold (-5) with 400', async () => {
      const res = await request(app)
        .put(`/api/inventory/${sampleBase._id}/stock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ threshold: -5 });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/threshold must be a non-negative number/i);
    });

    it('CHALLENGE-09: Rejects non-numeric threshold ("twenty") with 400', async () => {
      const res = await request(app)
        .put(`/api/inventory/${sampleBase._id}/stock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ threshold: 'twenty' });

      expect(res.status).toBe(400);
    });

    it('CHALLENGE-10: Rejects empty payload with 400', async () => {
      const res = await request(app)
        .put(`/api/inventory/${sampleBase._id}/stock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/stock or threshold value is required/i);
    });

    it('CHALLENGE-11: Blocks mass assignment tampering of price, category, or name', async () => {
      const res = await request(app)
        .put(`/api/inventory/${sampleBase._id}/stock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          stock: 75,
          price: 0,
          category: 'veggie',
          name: 'Hacked Base',
        });

      expect(res.status).toBe(200);
      expect(res.body.item.stock).toBe(75);

      // Verify in DB that price, category, and name were NOT altered
      const item = await Inventory.findById(sampleBase._id);
      expect(item.stock).toBe(75);
      expect(item.price).toBe(60); // intact
      expect(item.category).toBe('base'); // intact
      expect(item.name).toBe('Test Thin Crust'); // intact
    });

    it('CHALLENGE-12: Handles non-existent valid ObjectId with 404', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .put(`/api/inventory/${fakeId}/stock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ stock: 50 });

      expect(res.status).toBe(404);
      expect(res.body.message).toMatch(/not found/i);
    });

    it('CHALLENGE-13: Handles malformed ObjectId without crashing the server', async () => {
      const res = await request(app)
        .put('/api/inventory/invalid-object-id-12345/stock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ stock: 50 });

      // Either 500 (CastError handled gracefully by error middleware) or 400/404
      expect([400, 404, 500]).toContain(res.status);
    });
  });

  // =========================================================================
  // 2. Unauthorized Stock Tampering & Role Isolation
  // =========================================================================
  describe('2. Unauthorized Inventory Stock Updates', () => {
    it('CHALLENGE-14: Rejects update without Authorization header with 401', async () => {
      const res = await request(app)
        .put(`/api/inventory/${sampleBase._id}/stock`)
        .send({ stock: 99 });

      expect(res.status).toBe(401);
      const item = await Inventory.findById(sampleBase._id);
      expect(item.stock).toBe(50);
    });

    it('CHALLENGE-15: Rejects update with invalid Bearer token format with 401', async () => {
      const res = await request(app)
        .put(`/api/inventory/${sampleBase._id}/stock`)
        .set('Authorization', 'Bearer invalid.token.payload')
        .send({ stock: 99 });

      expect(res.status).toBe(401);
    });

    it('CHALLENGE-16: Rejects update with expired JWT token with 401', async () => {
      const expiredToken = jwt.sign(
        { id: sampleBase._id, role: 'admin' },
        process.env.JWT_SECRET || 'test_jwt_secret_key_12345',
        { expiresIn: '-1s' }
      );

      const res = await request(app)
        .put(`/api/inventory/${sampleBase._id}/stock`)
        .set('Authorization', `Bearer ${expiredToken}`)
        .send({ stock: 99 });

      expect(res.status).toBe(401);
    });

    it('CHALLENGE-17: Rejects update with forged admin token signed with wrong secret with 401', async () => {
      const forgedToken = jwt.sign(
        { id: 'fake_admin', role: 'admin' },
        'completely_wrong_secret_key_123',
        { expiresIn: '1h' }
      );

      const res = await request(app)
        .put(`/api/inventory/${sampleBase._id}/stock`)
        .set('Authorization', `Bearer ${forgedToken}`)
        .send({ stock: 99 });

      expect(res.status).toBe(401);
    });

    it('CHALLENGE-18: Rejects standard consumer user (role: "user") with 403 Forbidden', async () => {
      const res = await request(app)
        .put(`/api/inventory/${sampleBase._id}/stock`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ stock: 99 });

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/administrator privileges required/i);

      // Verify stock was not tampered with
      const item = await Inventory.findById(sampleBase._id);
      expect(item.stock).toBe(50);
    });
  });

  // =========================================================================
  // 3. Category Integrity & Schema Validation
  // =========================================================================
  describe('3. Category Integrity & Schema Validation', () => {
    it('CHALLENGE-19: Querying with invalid category returns empty array without crashing', async () => {
      const res = await request(app).get('/api/inventory?category=beverage_invalid');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(0);
    });

    it('CHALLENGE-20: Mongoose Inventory schema rejects invalid category enum', async () => {
      let validationError;
      try {
        await Inventory.create({
          name: 'Invalid Item Category',
          category: 'invalid_category_xyz',
          stock: 10,
          price: 50,
        });
      } catch (err) {
        validationError = err;
      }
      expect(validationError).toBeDefined();
      expect(validationError.name).toBe('ValidationError');
      expect(validationError.errors.category).toBeDefined();
    });

    it('CHALLENGE-21: inStock=true query filter excludes items with 0 stock', async () => {
      const res = await request(app).get('/api/inventory?inStock=true');
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1); // Only sampleBase (stock 50), not Test Marinara (stock 0)
      expect(res.body[0].name).toBe('Test Thin Crust');
    });

    it('CHALLENGE-22: virtual property isAvailable accurately mirrors stock > 0', async () => {
      const availableItem = await Inventory.findById(sampleBase._id);
      expect(availableItem.isAvailable).toBe(true);

      const outOfStockItem = await Inventory.findOne({ name: 'Test Marinara' });
      expect(outOfStockItem.isAvailable).toBe(false);
    });
  });

  // =========================================================================
  // 4. 5 Bases and 5 Sauces Integrity in Seed Data
  // =========================================================================
  describe('4. 5 Bases and 5 Sauces Seed Data Integrity', () => {
    it('CHALLENGE-23: inventoryData in seedData contains exactly 5 bases and 5 sauces', () => {
      const bases = inventoryData.filter((i) => i.category === 'base');
      const sauces = inventoryData.filter((i) => i.category === 'sauce');
      const cheeses = inventoryData.filter((i) => i.category === 'cheese');
      const veggies = inventoryData.filter((i) => i.category === 'veggie');

      expect(bases.length).toBe(5);
      expect(sauces.length).toBe(5);
      expect(cheeses.length).toBeGreaterThanOrEqual(2);
      expect(veggies.length).toBeGreaterThanOrEqual(4);

      const expectedBaseNames = [
        'Thin Crust',
        'Thick Crust',
        'Cheese Burst',
        'Flatbread',
        'Gluten-Free Crust',
      ];
      const actualBaseNames = bases.map((b) => b.name);
      expectedBaseNames.forEach((name) => {
        expect(actualBaseNames).toContain(name);
      });

      const expectedSauceNames = [
        'Classic Marinara',
        'Spicy Peri-Peri',
        'Creamy Alfredo',
        'BBQ Tangy',
        'Pesto Green',
      ];
      const actualSauceNames = sauces.map((s) => s.name);
      expectedSauceNames.forEach((name) => {
        expect(actualSauceNames).toContain(name);
      });
    });

    it('CHALLENGE-24: Every seeded item has positive price, initial stock, and threshold', () => {
      inventoryData.forEach((item) => {
        expect(item.price).toBeGreaterThan(0);
        expect(item.stock).toBeGreaterThan(0);
        expect(item.threshold).toBeGreaterThanOrEqual(20);
        expect(['base', 'sauce', 'cheese', 'veggie']).toContain(item.category);
      });
    });

    it('CHALLENGE-25: Rejects duplicate inventory item name with unique index error', async () => {
      let duplicateError;
      try {
        await Inventory.create({
          name: 'Test Thin Crust', // already created in beforeEach
          category: 'base',
          stock: 10,
          price: 50,
        });
      } catch (err) {
        duplicateError = err;
      }
      expect(duplicateError).toBeDefined();
      expect(duplicateError.code).toBe(11000);
    });
  });

  // =========================================================================
  // 5. Database Seeder Idempotency & Stability
  // =========================================================================
  describe('5. Database Seeder Idempotency', () => {
    it('CHALLENGE-26: Multiple seed executions do not produce duplicate records or errors', async () => {
      // Clear out test collections first
      await Inventory.deleteMany({});
      await Pizza.deleteMany({});
      await User.deleteMany({});

      // Run 1: initial seed
      await seedDatabase({ exitOnComplete: false });

      const count1Inventory = await Inventory.countDocuments();
      const count1Pizza = await Pizza.countDocuments();
      const count1User = await User.countDocuments();

      expect(count1Inventory).toBe(20); // 5 bases + 5 sauces + 3 cheeses + 7 veggies
      expect(count1Pizza).toBe(4);
      expect(count1User).toBe(1); // Default admin

      // Capture all IDs
      const items1 = await Inventory.find({}).sort({ name: 1 });
      const idMap1 = items1.map((i) => ({ name: i.name, id: i._id.toString() }));

      // Run 2: second seed
      await seedDatabase({ exitOnComplete: false });

      const count2Inventory = await Inventory.countDocuments();
      const count2Pizza = await Pizza.countDocuments();
      const count2User = await User.countDocuments();

      expect(count2Inventory).toBe(20);
      expect(count2Pizza).toBe(4);
      expect(count2User).toBe(1);

      // Run 3: third seed
      await seedDatabase({ exitOnComplete: false });

      const count3Inventory = await Inventory.countDocuments();
      const count3Pizza = await Pizza.countDocuments();
      const count3User = await User.countDocuments();

      expect(count3Inventory).toBe(20);
      expect(count3Pizza).toBe(4);
      expect(count3User).toBe(1);

      // Verify stability of document ObjectIds across re-seeding
      const items3 = await Inventory.find({}).sort({ name: 1 });
      const idMap3 = items3.map((i) => ({ name: i.name, id: i._id.toString() }));
      expect(idMap3).toEqual(idMap1);
    });

    it('CHALLENGE-27: Grouped endpoint returns exactly 5 bases and 5 sauces after full seed', async () => {
      await Inventory.deleteMany({});
      await Pizza.deleteMany({});
      await User.deleteMany({});
      await seedDatabase({ exitOnComplete: false });

      const res = await request(app).get('/api/inventory/grouped');
      expect(res.status).toBe(200);
      expect(res.body.bases.length).toBe(5);
      expect(res.body.sauces.length).toBe(5);
      expect(res.body.cheeses.length).toBe(3);
      expect(res.body.veggies.length).toBe(7);
    });
  });

  // =========================================================================
  // 6. Concurrency & Parallel Stock Updates
  // =========================================================================
  describe('6. Concurrency & Parallel Stock Updates', () => {
    it('CHALLENGE-28: Handles 10 parallel stock updates concurrently without race crashes', async () => {
      const updates = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

      const responses = await Promise.all(
        updates.map((newStock) =>
          request(app)
            .put(`/api/inventory/${sampleBase._id}/stock`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ stock: newStock })
        )
      );

      // All 10 requests should complete with 200
      responses.forEach((res) => {
        expect(res.status).toBe(200);
        expect(updates).toContain(res.body.item.stock);
      });

      // Final DB state should match one of the valid stock numbers
      const finalItem = await Inventory.findById(sampleBase._id);
      expect(updates).toContain(finalItem.stock);
      expect(finalItem.stock).toBeGreaterThanOrEqual(10);
      expect(finalItem.stock).toBeLessThanOrEqual(100);
    });
  });
});
