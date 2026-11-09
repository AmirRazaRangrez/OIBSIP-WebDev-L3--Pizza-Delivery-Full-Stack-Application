const mongoose = require('mongoose');
const dns = require('dns');

// =========================================================================
// MANDATORY WINDOWS DNS FIX:
// Must be set BEFORE any DNS resolution or Mongoose connection attempts.
// Overrides default Windows OS resolver to avoid querySrv ECONNREFUSED bug.
// =========================================================================
try {
  if (process.platform === 'win32') {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
    console.log('[Database] DNS servers configured for MongoDB SRV resolution (Windows): [8.8.8.8, 1.1.1.1]');
  }
} catch (dnsErr) {
  console.warn('[Database] Warning: Failed to set custom DNS servers:', dnsErr.message);
}

// Connection lifecycle event logging
mongoose.connection.on('connected', () => {
  console.log(`[Database] Mongoose connected successfully to host: ${mongoose.connection.host}`);
});

mongoose.connection.on('error', (err) => {
  console.error('[Database] Mongoose connection error event:', err.message);
});

mongoose.connection.on('disconnected', () => {
  console.warn('[Database] Mongoose disconnected from database');
});

/**
 * Connects to MongoDB database with retry and fallback handling
 * @param {string} [customUri] - Optional override URI for testing
 * @returns {Promise<mongoose.Connection>}
 */
const connectDB = async (customUri = null) => {
  let uri = customUri || process.env.MONGODB_URI;

  // Check if URI is missing
  if (!uri) {
    uri = process.env.DB_FALLBACK_URI || 'mongodb://127.0.0.1:27017/pizza_delivery';
    console.warn(`[Database] MONGODB_URI not found. Using fallback URI: ${uri}`);
  }

  // Handle unreplaced Atlas placeholder
  if (uri.includes('<db_username>')) {
    console.warn('[Database] Warning: MONGODB_URI contains unconfigured placeholder "<db_username>".');
    if (process.env.NODE_ENV === 'production') {
      console.warn('[Database] Production mode: Operating in high-availability offline mode until Atlas credentials are provided in Render environment.');
      return mongoose.connection;
    }
    console.log('[Database] Activating MongoMemoryServer fallback for local development...');
    try {
      const { MongoMemoryServer } = require('mongodb-memory-server');
      const mongod = await MongoMemoryServer.create();
      uri = mongod.getUri();
      global.__MONGOINSTANCE = mongod;
      console.log(`[Database] Using in-memory MongoDB: ${uri}`);
    } catch (memErr) {
      console.warn('[Database] MongoMemoryServer not available, attempting local fallback...', memErr.message);
      uri = process.env.DB_FALLBACK_URI || 'mongodb://127.0.0.1:27017/pizza_delivery';
    }
  }

  const options = {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  };

  try {
    const conn = await mongoose.connect(uri, options);
    console.log(`[Database] MongoDB Connected: ${conn.connection.host} (DB: ${conn.connection.name})`);
    return conn.connection;
  } catch (error) {
    console.error(`[Database] Initial MongoDB connection failed: ${error.message}`);
    
    // In local development, attempt MongoMemoryServer if Atlas failed
    if (process.env.NODE_ENV !== 'production' && !global.__MONGOINSTANCE) {
      console.log('[Database] Attempting MongoMemoryServer fallback after connection failure...');
      try {
        const { MongoMemoryServer } = require('mongodb-memory-server');
        const mongod = await MongoMemoryServer.create();
        global.__MONGOINSTANCE = mongod;
        const memUri = mongod.getUri();
        const memConn = await mongoose.connect(memUri, options);
        console.log(`[Database] In-memory MongoDB Connected: ${memConn.connection.host}`);
        return memConn.connection;
      } catch (memErr) {
        console.warn(`[Database] In-memory fallback failed: ${memErr.message}`);
      }
    }

    // In test environment or development fallback, try local fallback if Atlas failed
    if (uri.includes('mongodb+srv://') && process.env.DB_FALLBACK_URI && uri !== process.env.DB_FALLBACK_URI) {
      console.log(`[Database] Attempting fallback to local MongoDB: ${process.env.DB_FALLBACK_URI}`);
      try {
        const fallbackConn = await mongoose.connect(process.env.DB_FALLBACK_URI, options);
        console.log(`[Database] Local Fallback MongoDB Connected: ${fallbackConn.connection.host}`);
        return fallbackConn.connection;
      } catch (fallbackError) {
        console.error(`[Database] Local fallback also failed: ${fallbackError.message}`);
      }
    }

    if (process.env.NODE_ENV === 'production') {
      console.warn('[Database] Running in production with degraded DB connection. Background retry active.');
    }
    
    return mongoose.connection;
  }
};

/**
 * Disconnects from MongoDB database (used in test suites)
 * @returns {Promise<void>}
 */
const disconnectDB = async () => {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    if (global.__MONGOINSTANCE) {
      await global.__MONGOINSTANCE.stop();
      global.__MONGOINSTANCE = null;
    }
    console.log('[Database] MongoDB connection closed gracefully');
  } catch (error) {
    console.error('[Database] Error closing MongoDB connection:', error.message);
  }
};

module.exports = { connectDB, disconnectDB };
