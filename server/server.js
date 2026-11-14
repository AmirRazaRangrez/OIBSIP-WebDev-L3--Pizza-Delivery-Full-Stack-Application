const express = require('express');
const http = require('http');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables before any other imports
dotenv.config();

const { connectDB, disconnectDB } = require('./config/db');
const { notFoundHandler, errorHandler } = require('./middleware/errorMiddleware');
const { initSocket } = require('./socket');
const cronService = require('./services/cronService');

// Initialize Express App
const app = express();

// Create HTTP Server
const server = http.createServer(app);

// Initialize Socket.io Server
const io = initSocket(server);

// Store io on app and attach to request
app.set('io', io);
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Middleware: CORS
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const clientUrl = process.env.CLIENT_URL || '';
    const allowed = clientUrl.split(',').map(u => u.trim());
    if (
      clientUrl === '*' ||
      allowed.includes(origin) ||
      origin.endsWith('.pages.dev') ||
      origin.includes('localhost') ||
      origin.includes('127.0.0.1')
    ) {
      return callback(null, true);
    }
    return callback(null, true); // Permissive fallback
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Middleware: Body Parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Middleware: Request Logger (Development mode)
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`[HTTP] ${req.method} ${req.originalUrl}`);
    next();
  });
}

// =========================================================================
// ROOT API STATUS & HEALTH ROUTE
// =========================================================================
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'online',
    service: 'Zomato Pizza Delivery & Inventory Engine',
    health: '/api/health',
    pizzas: '/api/pizzas',
    version: '1.0.0'
  });
});

app.get('/api/health', (req, res) => {
  const mongoose = require('mongoose');
  const dbStates = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };

  const dbState = dbStates[mongoose.connection.readyState] || 'unknown';

  const emailService = require('./services/emailService');
  const resendActive = Boolean(process.env.RESEND_API_KEY);
  const emailConfigured = Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS) || resendActive;
  const emailMasked = process.env.EMAIL_USER
    ? process.env.EMAIL_USER.replace(/(.{2})(.*)(@.*)/, '$1***$3')
    : null;

  res.status(200).json({
    status: 'OK',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    database: {
      status: dbState,
      host: mongoose.connection.host || 'none',
      name: mongoose.connection.name || 'none'
    },
    environment: process.env.NODE_ENV || 'development',
    services: {
      websockets: 'active',
      email: {
        provider: resendActive ? 'resend_https_port_443' : (process.env.EMAIL_USER ? 'gmail_smtp' : 'mock_console'),
        status: resendActive ? 'connected' : (emailConfigured ? (emailService.smtpReady ? 'connected' : 'authenticating_or_error') : 'mock_console'),
        sender: resendActive ? (process.env.EMAIL_FROM || 'onboarding@resend.dev') : emailMasked,
        error: emailService.lastError || null
      },
      razorpay: process.env.RAZORPAY_KEY_ID ? 'configured' : 'unconfigured'
    }
  });
});

// =========================================================================
// API ROUTE MOUNTING
// =========================================================================
try {
  app.use('/api/auth', require('./routes/authRoutes'));
} catch (e) {
  app.use('/api/auth', (req, res) => res.status(503).json({ message: 'Auth routes module initializing' }));
}

try {
  app.use('/api/admin', require('./routes/adminRoutes'));
} catch (e) {
  app.use('/api/admin', (req, res) => res.status(503).json({ message: 'Admin routes module initializing' }));
}

try {
  app.use('/api/inventory', require('./routes/inventoryRoutes'));
} catch (e) {
  app.use('/api/inventory', (req, res) => res.status(503).json({ message: 'Inventory routes module initializing' }));
}

try {
  app.use('/api/pizzas', require('./routes/pizzaRoutes'));
} catch (e) {
  app.use('/api/pizzas', (req, res) => res.status(503).json({ message: 'Pizza routes module initializing' }));
}

try {
  app.use('/api/orders', require('./routes/orderRoutes'));
} catch (e) {
  app.use('/api/orders', (req, res) => res.status(503).json({ message: 'Order routes module initializing' }));
}

// Error Handling Middleware
app.use(notFoundHandler);
app.use(errorHandler);

// Initialize Database Connection
if (process.env.NODE_ENV !== 'test') {
  connectDB().then(async () => {
    try {
      const mongoose = require('mongoose');
      if (mongoose.connection.readyState !== 1) {
        console.warn('[Server] Notice: MongoDB not connected. Auto-seeding deferred.');
        return;
      }
      const Inventory = require('./models/Inventory');
      const count = await Inventory.countDocuments();
      if (count === 0) {
        console.log('[Server] Database empty. Auto-seeding catalog & admin account...');
        const { seedDatabase } = require('./seed/seedData');
        await seedDatabase({ exitOnComplete: false });
        console.log('[Server] Auto-seeding completed successfully.');
      }
    } catch (err) {
      console.warn('[Server] Auto-seed notice:', err.message);
    }
  });
}

// Server Listen (Only when executed directly, NOT during tests)
const PORT = process.env.PORT || 5000;
if (process.env.NODE_ENV !== 'test') {
  cronService.startCronJob();
  
  server.on('error', (err) => {
    console.error('[Server] Fatal server error:', err.message);
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(`🍕 Pizza Delivery Server active on 0.0.0.0:${PORT}`);
    console.log(`🚀 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🌐 Health check: http://0.0.0.0:${PORT}/api/health`);
    console.log(`=======================================================`);
  });
}

// Graceful Termination Handlers
const handleShutdown = async (signal) => {
  console.log(`\n[Server] Received ${signal}. Initiating graceful shutdown...`);
  cronService.stopCronJob();
  server.close(async () => {
    console.log('[Server] HTTP and WebSocket server closed.');
    await disconnectDB();
    process.exit(0);
  });
};

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

// Dual export: both app directly (as function) and { app, server, io }
app.app = app;
app.server = server;
app.io = io;

module.exports = app;
module.exports.app = app;
module.exports.server = server;
module.exports.io = io;
