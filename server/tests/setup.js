const dns = require('dns');
try {
  if (process.platform === 'win32') {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
  }
} catch (e) {
  // ignore if already set
}

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Set global Jest test timeout
jest.setTimeout(60000);

let mongoServer;

beforeAll(async () => {
  process.env.JWT_SECRET = 'test_jwt_secret_key_12345';
  process.env.NODE_ENV = 'test';
  process.env.EMAIL_MOCK = 'true';

  try {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`[Tests Setup] Connected to in-memory MongoDB: ${uri}`);
  } catch (err) {
    console.warn('[Tests Setup] MongoMemoryServer launch failed, attempting local MongoDB fallback...', err.message);
    const fallbackUri = process.env.DB_FALLBACK_URI || 'mongodb://127.0.0.1:27017/pizza_delivery_test';
    await mongoose.connect(fallbackUri, {
      serverSelectionTimeoutMS: 5000,
    });
  }
}, 300000);

afterEach(async () => {
  if (mongoose.connection.readyState === 1) {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
  }
});

afterAll(async () => {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    if (mongoServer) {
      await mongoServer.stop();
    }
  } catch (teardownErr) {
    console.warn('[Tests Setup] Error during teardown:', teardownErr.message);
  }
  console.log('[Tests Setup] Disconnected from test MongoDB database');
}, 60000);

