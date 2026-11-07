const dns = require('dns');
// Enforce Google/Cloudflare DNS servers on Windows to prevent Atlas SRV resolution failures
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {
  console.warn('DNS server override failed, using default OS resolver');
}

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const { connectDB, disconnectDB } = require('../config/db');
const Inventory = require('../models/Inventory');
const Pizza = require('../models/Pizza');
const User = require('../models/User');

const inventoryData = [
  // 5 Bases
  { name: 'Thin Crust', category: 'base', stock: 50, threshold: 20, price: 60, description: 'Crispy and light classic Italian thin crust' },
  { name: 'Thick Crust', category: 'base', stock: 50, threshold: 20, price: 70, description: 'Soft, fluffy and doughy traditional pan base' },
  { name: 'Cheese Burst', category: 'base', stock: 50, threshold: 20, price: 110, description: 'Molten creamy cheese stuffed inside the crust edges' },
  { name: 'Flatbread', category: 'base', stock: 50, threshold: 20, price: 80, description: 'Rustic, oven-baked artisan flatbread crust' },
  { name: 'Gluten-Free Crust', category: 'base', stock: 50, threshold: 20, price: 95, description: 'Wholesome, wheat-free alternative crust' },

  // 5 Sauces
  { name: 'Classic Marinara', category: 'sauce', stock: 50, threshold: 20, price: 30, description: 'Vine-ripened San Marzano tomatoes with aromatic basil and oregano' },
  { name: 'Spicy Peri-Peri', category: 'sauce', stock: 50, threshold: 20, price: 40, description: 'Fiery African bird\'s eye chili and garlic blend' },
  { name: 'Creamy Alfredo', category: 'sauce', stock: 50, threshold: 20, price: 45, description: 'Rich garlic parmesan white cream sauce' },
  { name: 'BBQ Tangy', category: 'sauce', stock: 50, threshold: 20, price: 35, description: 'Sweet, smoky and savory barbecue sauce' },
  { name: 'Pesto Green', category: 'sauce', stock: 50, threshold: 20, price: 50, description: 'Fresh sweet basil, pine nuts, olive oil, and parmesan' },

  // Cheeses
  { name: 'Mozzarella', category: 'cheese', stock: 50, threshold: 20, price: 60, description: 'Fresh, creamy whole-milk stringy cheese' },
  { name: 'Cheddar', category: 'cheese', stock: 50, threshold: 20, price: 70, description: 'Sharp, aged english cheddar with rich savory notes' },
  { name: 'Parmesan', category: 'cheese', stock: 50, threshold: 20, price: 80, description: 'Aged Parmigiano-Reggiano with nutty texture' },

  // Veggies
  { name: 'Bell Peppers', category: 'veggie', stock: 50, threshold: 20, price: 30, description: 'Crunchy tri-color bell peppers' },
  { name: 'Mushrooms', category: 'veggie', stock: 50, threshold: 20, price: 35, description: 'Earthy, freshly sliced white button mushrooms' },
  { name: 'Onions', category: 'veggie', stock: 50, threshold: 20, price: 20, description: 'Crispy sliced red onions' },
  { name: 'Black Olives', category: 'veggie', stock: 50, threshold: 20, price: 40, description: 'Rich, savory pitted Mediterranean black olives' },
  { name: 'Jalapenos', category: 'veggie', stock: 50, threshold: 20, price: 30, description: 'Tangy and zesty sliced pickled jalapeno peppers' },
  { name: 'Tomatoes', category: 'veggie', stock: 50, threshold: 20, price: 25, description: 'Juicy sliced farm-fresh Roma tomatoes' },
  { name: 'Sweet Corn', category: 'veggie', stock: 50, threshold: 20, price: 25, description: 'Sweet tender golden American corn kernels' },
];

async function seedDatabase(options = { exitOnComplete: true }) {
  try {
    if (mongoose.connection.readyState === 0) {
      console.log('Connecting to database for seeding...');
      await connectDB();
      console.log('Connected to MongoDB successfully.');
    }

    console.log('--- Starting Seed Execution ---');

    // 1. Seed or Upsert Inventory
    const inventoryMap = {};
    for (const item of inventoryData) {
      const savedItem = await Inventory.findOneAndUpdate(
        { name: item.name },
        { $set: item },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      inventoryMap[item.name] = savedItem;
    }
    console.log(`✓ Seeded ${Object.keys(inventoryMap).length} inventory items (5 bases, 5 sauces, cheeses, veggies).`);

    // 2. Seed Preconfigured Pizzas
    const pizzasData = [
      {
        name: 'Margherita',
        description: 'Classic Neapolitan delight with aromatic Marinara sauce, whole milk Mozzarella, and fresh herbs on our crisp Thin Crust.',
        price: 279,
        image: '/images/margherita.jpg',
        isPreconfigured: true,
        isVegetarian: true,
        ingredients: [
          { inventoryId: inventoryMap['Thin Crust']._id, name: 'Thin Crust', category: 'base', quantity: 1 },
          { inventoryId: inventoryMap['Classic Marinara']._id, name: 'Classic Marinara', category: 'sauce', quantity: 1 },
          { inventoryId: inventoryMap['Mozzarella']._id, name: 'Mozzarella', category: 'cheese', quantity: 1 },
        ],
      },
      {
        name: 'Farmhouse',
        description: 'Loaded with fresh crunchy Bell Peppers, earthy Mushrooms, crisp Onions, and juicy Tomatoes over Classic Marinara and melted Mozzarella on Thick Crust.',
        price: 429,
        image: '/images/farmhouse.jpg',
        isPreconfigured: true,
        isVegetarian: true,
        ingredients: [
          { inventoryId: inventoryMap['Thick Crust']._id, name: 'Thick Crust', category: 'base', quantity: 1 },
          { inventoryId: inventoryMap['Classic Marinara']._id, name: 'Classic Marinara', category: 'sauce', quantity: 1 },
          { inventoryId: inventoryMap['Mozzarella']._id, name: 'Mozzarella', category: 'cheese', quantity: 1 },
          { inventoryId: inventoryMap['Bell Peppers']._id, name: 'Bell Peppers', category: 'veggie', quantity: 1 },
          { inventoryId: inventoryMap['Mushrooms']._id, name: 'Mushrooms', category: 'veggie', quantity: 1 },
          { inventoryId: inventoryMap['Onions']._id, name: 'Onions', category: 'veggie', quantity: 1 },
          { inventoryId: inventoryMap['Tomatoes']._id, name: 'Tomatoes', category: 'veggie', quantity: 1 },
        ],
      },
      {
        name: 'Paneer Feast',
        description: 'Indulgent spicy feast featuring fiery Spicy Peri-Peri sauce, molten Cheese Burst crust, Mozzarella, Bell Peppers, and hot Jalapenos.',
        price: 479,
        image: '/images/paneer-feast.jpg',
        isPreconfigured: true,
        isVegetarian: true,
        ingredients: [
          { inventoryId: inventoryMap['Cheese Burst']._id, name: 'Cheese Burst', category: 'base', quantity: 1 },
          { inventoryId: inventoryMap['Spicy Peri-Peri']._id, name: 'Spicy Peri-Peri', category: 'sauce', quantity: 1 },
          { inventoryId: inventoryMap['Mozzarella']._id, name: 'Mozzarella', category: 'cheese', quantity: 1 },
          { inventoryId: inventoryMap['Bell Peppers']._id, name: 'Bell Peppers', category: 'veggie', quantity: 1 },
          { inventoryId: inventoryMap['Jalapenos']._id, name: 'Jalapenos', category: 'veggie', quantity: 1 },
        ],
      },
      {
        name: 'Veggie Supreme',
        description: 'The ultimate garden pizza on artisan Flatbread with smoky BBQ sauce, aged Cheddar, Black Olives, Sweet Corn, Mushrooms, and Bell Peppers.',
        price: 499,
        image: '/images/veggie-supreme.jpg',
        isPreconfigured: true,
        isVegetarian: true,
        ingredients: [
          { inventoryId: inventoryMap['Flatbread']._id, name: 'Flatbread', category: 'base', quantity: 1 },
          { inventoryId: inventoryMap['BBQ Tangy']._id, name: 'BBQ Tangy', category: 'sauce', quantity: 1 },
          { inventoryId: inventoryMap['Cheddar']._id, name: 'Cheddar', category: 'cheese', quantity: 1 },
          { inventoryId: inventoryMap['Black Olives']._id, name: 'Black Olives', category: 'veggie', quantity: 1 },
          { inventoryId: inventoryMap['Sweet Corn']._id, name: 'Sweet Corn', category: 'veggie', quantity: 1 },
          { inventoryId: inventoryMap['Mushrooms']._id, name: 'Mushrooms', category: 'veggie', quantity: 1 },
          { inventoryId: inventoryMap['Bell Peppers']._id, name: 'Bell Peppers', category: 'veggie', quantity: 1 },
        ],
      },
    ];

    for (const p of pizzasData) {
      await Pizza.findOneAndUpdate(
        { name: p.name },
        { $set: p },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }
    console.log(`✓ Seeded ${pizzasData.length} pre-configured pizzas.`);

    // 3. Seed Default System Admin
    const adminEmail = 'admin@pizzadelivery.com';
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('AdminPassword123!', salt);

    const adminUser = await User.findOneAndUpdate(
      { email: adminEmail },
      {
        $set: {
          name: 'System Admin',
          email: adminEmail,
          password: hashedPassword,
          role: 'admin',
          isVerified: true,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    console.log(`✓ Seeded default admin account: ${adminUser.email} (role: admin, isVerified: true).`);

    console.log('--- Seeding Completed Successfully ---');
    if (options.exitOnComplete) {
      await disconnectDB();
      process.exit(0);
    }
  } catch (error) {
    console.error('Seeding failed with error:', error);
    if (options.exitOnComplete) {
      await disconnectDB();
      process.exit(1);
    }
    throw error;
  }
}

if (require.main === module) {
  seedDatabase();
}

module.exports = { seedDatabase, inventoryData };
