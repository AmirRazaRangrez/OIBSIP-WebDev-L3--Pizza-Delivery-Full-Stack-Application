// e2e_tests/mock-server/server.js
import http from 'node:http';
import { URL } from 'node:url';
import crypto from 'node:crypto';
import EventEmitter from 'node:events';
import { mockDb } from './mockDb.js';
import { config } from '../config.js';
import { createTestJwt, decodeJwt, verifyJwt, generateRazorpaySignature } from '../helpers/cryptoHelper.js';

export class MockServer extends EventEmitter {
  constructor() {
    super();
    this.server = null;
    this.port = 0;
    this.connectedSockets = new Set();
    this.lowStockAlerts = [];
  }

  registerClient(socketClient) {
    this.connectedSockets.add(socketClient);
    socketClient.bindMockServer(this);
  }

  unregisterClient(socketClient) {
    this.connectedSockets.delete(socketClient);
  }

  handleClientEvent(socketClient, event, data) {
    if (event === 'join_order') {
      socketClient.rooms.add(`order_${data}`);
    } else if (event === 'join_room') {
      socketClient.rooms.add(data);
    }
  }

  broadcastToRoom(room, event, payload) {
    for (const socket of this.connectedSockets) {
      if (socket.rooms && socket.rooms.has(room)) {
        socket.receiveFromServer(event, payload);
      }
    }
    this.emit('broadcast', { room, event, payload });
  }

  broadcastToAll(event, payload) {
    for (const socket of this.connectedSockets) {
      socket.receiveFromServer(event, payload);
    }
    this.emit('broadcast', { room: '*', event, payload });
  }

  checkLowStock() {
    const triggeredAlerts = [];
    for (const item of mockDb.inventory) {
      if (item.stock < item.threshold) {
        triggeredAlerts.push({
          itemId: item._id,
          name: item.name,
          category: item.category,
          stock: item.stock,
          threshold: item.threshold
        });
      }
    }
    this.lowStockAlerts.push(...triggeredAlerts);
    return triggeredAlerts;
  }

  async start(preferredPort = 0) {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        try {
          await this.handleRequest(req, res);
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal Server Error', message: err.message }));
        }
      });

      this.server.listen(preferredPort, () => {
        const addr = this.server.address();
        this.port = typeof addr === 'object' ? addr.port : preferredPort;
        resolve(`http://localhost:${this.port}`);
      });

      this.server.on('error', reject);
    });
  }

  async stop() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(resolve);
      });
    }
  }

  parseRequestBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
        if (body.length > 5 * 1024 * 1024) {
          reject(new Error('Payload too large'));
        }
      });
      req.on('end', () => {
        if (!body) return resolve({});
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error('Malformed JSON'));
        }
      });
      req.on('error', reject);
    });
  }

  sendJson(res, statusCode, data) {
    res.writeHead(statusCode, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*'
    });
    res.end(JSON.stringify(data));
  }

  authenticate(req, requiredRole = null) {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { authenticated: false, status: 401, error: 'No token provided' };
    }
    const token = authHeader.slice(7).trim();
    const decoded = verifyJwt(token, config.jwtSecret);
    if (!decoded || !decoded.id) {
      return { authenticated: false, status: 401, error: 'Invalid or expired token' };
    }
    if (requiredRole && decoded.role !== requiredRole) {
      return { authenticated: false, status: 403, error: `Forbidden: requires ${requiredRole} role` };
    }
    return { authenticated: true, user: decoded };
  }

  async handleRequest(req, res) {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;
    const method = req.method.toUpperCase();

    // CORS preflight
    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      });
      return res.end();
    }

    // 1. POST /api/auth/register
    if (method === 'POST' && pathname === '/api/auth/register') {
      let body;
      try {
        body = await this.parseRequestBody(req);
      } catch (err) {
        return this.sendJson(res, 400, { error: err.message });
      }

      const { name, email, password } = body;
      if (!name || !email || !password || typeof email !== 'string' || typeof password !== 'string' || typeof name !== 'string') {
        return this.sendJson(res, 400, { error: 'Name, email, and password are required' });
      }
      if (!email.includes('@') || !email.includes('.')) {
        return this.sendJson(res, 400, { error: 'Invalid email format' });
      }
      if (password.length < 6) {
        return this.sendJson(res, 400, { error: 'Password must be at least 6 characters' });
      }
      if (mockDb.users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
        return this.sendJson(res, 409, { error: 'Email already registered' });
      }

      const userId = `usr_${Date.now()}`;
      const token = `verify_${crypto.randomBytes(16).toString('hex')}`;
      
      const newUser = {
        _id: userId,
        name,
        email: email.toLowerCase(),
        passwordHash: `hashed_${password}`,
        role: 'user',
        isVerified: false,
        createdAt: new Date().toISOString()
      };

      mockDb.users.push(newUser);
      mockDb.verificationTokens.set(token, userId);

      return this.sendJson(res, 201, {
        message: 'Registration successful. Please verify your email.',
        emailVerificationToken: token,
        user: { id: userId, name: newUser.name, email: newUser.email, role: newUser.role }
      });
    }

    // 2. GET /api/auth/verify-email
    if (method === 'GET' && pathname === '/api/auth/verify-email') {
      const token = parsedUrl.searchParams.get('token');
      if (!token || !mockDb.verificationTokens.has(token)) {
        return this.sendJson(res, 400, { error: 'Invalid or expired verification token' });
      }

      const userId = mockDb.verificationTokens.get(token);
      const user = mockDb.users.find(u => u._id === userId);
      if (!user) {
        return this.sendJson(res, 404, { error: 'User not found' });
      }

      user.isVerified = true;
      mockDb.verificationTokens.delete(token);

      return this.sendJson(res, 200, { message: 'Email verified successfully' });
    }

    // 3. POST /api/auth/login
    if (method === 'POST' && pathname === '/api/auth/login') {
      let body;
      try {
        body = await this.parseRequestBody(req);
      } catch (err) {
        return this.sendJson(res, 400, { error: err.message });
      }

      const { email, password } = body;
      if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
        return this.sendJson(res, 400, { error: 'Email and password are required' });
      }

      const user = mockDb.users.find(u => u.email.toLowerCase() === email.toLowerCase());
      if (!user || user.passwordHash !== `hashed_${password}`) {
        return this.sendJson(res, 401, { error: 'Invalid email or password' });
      }

      if (!user.isVerified) {
        return this.sendJson(res, 403, { error: 'Please verify your email before logging in' });
      }

      const token = createTestJwt({ id: user._id, name: user.name, email: user.email, role: user.role });
      return this.sendJson(res, 200, {
        token,
        user: { id: user._id, name: user.name, email: user.email, role: user.role }
      });
    }

    // 4. POST /api/auth/forgot-password
    if (method === 'POST' && pathname === '/api/auth/forgot-password') {
      let body;
      try {
        body = await this.parseRequestBody(req);
      } catch (err) {
        return this.sendJson(res, 400, { error: err.message });
      }

      const { email } = body;
      if (!email || typeof email !== 'string' || !email.trim()) {
        return this.sendJson(res, 400, { error: 'Email is required' });
      }

      const user = mockDb.users.find(u => u.email.toLowerCase() === email.toLowerCase());
      let resetToken = null;
      if (user) {
        resetToken = `reset_${crypto.randomBytes(16).toString('hex')}`;
        mockDb.resetTokens.set(resetToken, { userId: user._id, expiresAt: Date.now() + 3600000 });
      }

      return this.sendJson(res, 200, {
        message: 'If the email exists, a reset link has been dispatched',
        resetToken
      });
    }

    // 5. POST /api/auth/reset-password
    if (method === 'POST' && pathname === '/api/auth/reset-password') {
      let body;
      try {
        body = await this.parseRequestBody(req);
      } catch (err) {
        return this.sendJson(res, 400, { error: err.message });
      }

      const { token, newPassword } = body;
      if (!token || !newPassword || typeof token !== 'string' || typeof newPassword !== 'string') {
        return this.sendJson(res, 400, { error: 'Token and new password are required' });
      }

      const record = mockDb.resetTokens.get(token);
      if (!record || record.expiresAt < Date.now()) {
        return this.sendJson(res, 400, { error: 'Invalid or expired reset token' });
      }

      const user = mockDb.users.find(u => u._id === record.userId);
      if (!user) {
        return this.sendJson(res, 404, { error: 'User not found' });
      }

      user.passwordHash = `hashed_${newPassword}`;
      mockDb.resetTokens.delete(token);

      return this.sendJson(res, 200, { message: 'Password updated successfully' });
    }

    // 6. POST /api/admin/auth/login
    if (method === 'POST' && pathname === '/api/admin/auth/login') {
      let body;
      try {
        body = await this.parseRequestBody(req);
      } catch (err) {
        return this.sendJson(res, 400, { error: err.message });
      }

      const { email, password } = body;
      if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
        return this.sendJson(res, 400, { error: 'Email and password required' });
      }

      const admin = mockDb.users.find(u => u.email.toLowerCase() === email.toLowerCase());
      if (!admin || admin.passwordHash !== `hashed_${password}`) {
        return this.sendJson(res, 401, { error: 'Invalid credentials' });
      }
      if (admin.role !== 'admin') {
        return this.sendJson(res, 403, { error: 'Access denied: Admin credentials required' });
      }

      const token = createTestJwt({ id: admin._id, name: admin.name, email: admin.email, role: 'admin' });
      return this.sendJson(res, 200, {
        token,
        admin: { id: admin._id, name: admin.name, email: admin.email, role: 'admin' }
      });
    }

    // 7. GET /api/inventory
    if (method === 'GET' && pathname === '/api/inventory') {
      return this.sendJson(res, 200, mockDb.inventory);
    }

    // 8. GET /api/inventory/grouped
    if (method === 'GET' && pathname === '/api/inventory/grouped') {
      const grouped = {
        bases: mockDb.inventory.filter(i => i.category === 'base'),
        sauces: mockDb.inventory.filter(i => i.category === 'sauce'),
        cheeses: mockDb.inventory.filter(i => i.category === 'cheese'),
        veggies: mockDb.inventory.filter(i => i.category === 'veggie')
      };
      return this.sendJson(res, 200, grouped);
    }

    // 9. PUT /api/inventory/:id/stock (Admin only)
    if (method === 'PUT' && pathname.startsWith('/api/inventory/') && pathname.endsWith('/stock')) {
      const auth = this.authenticate(req, 'admin');
      if (!auth.authenticated) {
        return this.sendJson(res, auth.status, { error: auth.error });
      }

      const parts = pathname.split('/');
      const itemId = parts[3];
      const item = mockDb.inventory.find(i => i._id === itemId);
      if (!item) {
        return this.sendJson(res, 404, { error: 'Inventory item not found' });
      }

      let body;
      try {
        body = await this.parseRequestBody(req);
      } catch (err) {
        return this.sendJson(res, 400, { error: err.message });
      }

      if (body.stock !== undefined) {
        if (typeof body.stock !== 'number' || body.stock < 0) {
          return this.sendJson(res, 400, { error: 'Stock must be a non-negative number' });
        }
        item.stock = body.stock;
      }
      if (body.threshold !== undefined) {
        if (typeof body.threshold !== 'number' || body.threshold < 0) {
          return this.sendJson(res, 400, { error: 'Threshold must be a non-negative number' });
        }
        item.threshold = body.threshold;
      }

      this.broadcastToAll('inventory_updated', { inventoryId: item._id, currentStock: item.stock });
      return this.sendJson(res, 200, { item });
    }

    // 10. GET /api/pizzas (Pre-configured catalog)
    if (method === 'GET' && pathname === '/api/pizzas') {
      return this.sendJson(res, 200, mockDb.preConfiguredPizzas);
    }

    // 11. POST /api/orders/create-razorpay-order
    if (method === 'POST' && pathname === '/api/orders/create-razorpay-order') {
      const auth = this.authenticate(req);
      if (!auth.authenticated) {
        return this.sendJson(res, auth.status, { error: auth.error });
      }

      let body;
      try {
        body = await this.parseRequestBody(req);
      } catch (err) {
        return this.sendJson(res, 400, { error: err.message });
      }

      const { items, deliveryAddress } = body;

      if (!items || !Array.isArray(items) || items.length === 0) {
        return this.sendJson(res, 400, { error: 'Items array is required' });
      }
      if (!deliveryAddress || typeof deliveryAddress !== 'string' || !deliveryAddress.trim()) {
        return this.sendJson(res, 400, { error: 'Delivery address is required' });
      }

      // Calculate total server-side
      let calculatedTotal = 0;
      for (const item of items) {
        if (!item.quantity || item.quantity <= 0) {
          return this.sendJson(res, 400, { error: 'Item quantity must be greater than 0' });
        }

        if (item.type === 'custom') {
          const { baseId, sauceId, cheeseId, veggieIds } = item.customDetails || {};
          if (!baseId || !sauceId || !cheeseId) {
            return this.sendJson(res, 400, { error: 'Custom pizza requires base, sauce, and cheese' });
          }

          const base = mockDb.inventory.find(i => i._id === baseId);
          const sauce = mockDb.inventory.find(i => i._id === sauceId);
          const cheese = mockDb.inventory.find(i => i._id === cheeseId);
          if (!base || !sauce || !cheese) {
            return this.sendJson(res, 400, { error: 'Invalid ingredient ID provided' });
          }

          let itemPrice = base.price + sauce.price + cheese.price;
          if (Array.isArray(veggieIds)) {
            for (const vId of veggieIds) {
              const veggie = mockDb.inventory.find(i => i._id === vId);
              if (veggie) itemPrice += veggie.price;
            }
          }
          calculatedTotal += itemPrice * item.quantity;
        } else {
          const prePizza = mockDb.preConfiguredPizzas.find(p => p._id === item.pizzaId);
          if (!prePizza) {
            return this.sendJson(res, 400, { error: 'Invalid pizza ID provided' });
          }
          calculatedTotal += prePizza.price * item.quantity;
        }
      }

      const orderId = `ord_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      const razorpayOrderId = `order_rzp_${crypto.randomBytes(8).toString('hex')}`;
      const amountInPaise = calculatedTotal * 100;

      const newOrder = {
        _id: orderId,
        userId: auth.user.id,
        items,
        deliveryAddress,
        totalAmount: calculatedTotal,
        paymentStatus: 'pending',
        orderStatus: 'Created',
        razorpayOrderId,
        createdAt: new Date().toISOString()
      };

      mockDb.orders.push(newOrder);

      return this.sendJson(res, 200, {
        orderId: newOrder._id,
        razorpayOrderId,
        amount: amountInPaise,
        currency: 'INR',
        key: config.razorpayKeyId
      });
    }

    // 12. POST /api/orders/verify-payment
    if (method === 'POST' && pathname === '/api/orders/verify-payment') {
      const auth = this.authenticate(req);
      if (!auth.authenticated) {
        return this.sendJson(res, auth.status, { error: auth.error });
      }

      let body;
      try {
        body = await this.parseRequestBody(req);
      } catch (err) {
        return this.sendJson(res, 400, { error: err.message });
      }

      const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;

      if (!orderId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return this.sendJson(res, 400, { error: 'Missing required payment verification fields' });
      }

      const order = mockDb.orders.find(o => o._id === orderId);
      if (!order) {
        return this.sendJson(res, 404, { error: 'Order not found' });
      }
      if (order.paymentStatus === 'paid') {
        return this.sendJson(res, 400, { error: 'Order is already paid' });
      }

      // Verify HMAC-SHA256 signature
      const expectedSignature = generateRazorpaySignature(razorpay_order_id, razorpay_payment_id);
      if (expectedSignature !== razorpay_signature) {
        return this.sendJson(res, 400, { error: 'Invalid payment signature' });
      }

      // Atomic Stock Sufficiency Check
      for (const item of order.items) {
        if (item.type === 'custom') {
          const { baseId, sauceId, cheeseId, veggieIds } = item.customDetails || {};
          const requiredIds = [baseId, sauceId, cheeseId, ...(veggieIds || [])].filter(Boolean);
          for (const invId of requiredIds) {
            const inv = mockDb.inventory.find(i => i._id === invId);
            if (!inv || inv.stock < item.quantity) {
              return this.sendJson(res, 400, { error: `Insufficient stock for ingredient: ${inv ? inv.name : invId}` });
            }
          }
        }
      }

      // Decrement stock atomically
      for (const item of order.items) {
        if (item.type === 'custom') {
          const { baseId, sauceId, cheeseId, veggieIds } = item.customDetails || {};
          const requiredIds = [baseId, sauceId, cheeseId, ...(veggieIds || [])].filter(Boolean);
          for (const invId of requiredIds) {
            const inv = mockDb.inventory.find(i => i._id === invId);
            inv.stock -= item.quantity;
            this.broadcastToAll('inventory_updated', { inventoryId: inv._id, currentStock: inv.stock });
          }
        }
      }

      order.paymentStatus = 'paid';
      order.orderStatus = 'Order Received';
      order.paidAt = new Date().toISOString();

      this.broadcastToRoom('admin_orders', 'new_order_placed', { orderId: order._id, total: order.totalAmount });
      this.broadcastToRoom(`order_${order._id}`, 'order_status_updated', {
        orderId: order._id,
        status: order.orderStatus,
        updatedAt: order.paidAt
      });

      return this.sendJson(res, 200, {
        message: 'Payment verified and order placed successfully',
        order
      });
    }

    // 13. GET /api/orders (User order history)
    if (method === 'GET' && pathname === '/api/orders') {
      const auth = this.authenticate(req);
      if (!auth.authenticated) {
        return this.sendJson(res, auth.status, { error: auth.error });
      }

      const userOrders = mockDb.orders.filter(o => o.userId === auth.user.id);
      return this.sendJson(res, 200, userOrders);
    }

    // 14. GET /api/admin/orders (Admin list all orders)
    if (method === 'GET' && pathname === '/api/admin/orders') {
      const auth = this.authenticate(req, 'admin');
      if (!auth.authenticated) {
        return this.sendJson(res, auth.status, { error: auth.error });
      }

      return this.sendJson(res, 200, mockDb.orders);
    }

    // 15. PATCH /api/admin/orders/:id/status (Admin status progression)
    if (method === 'PATCH' && pathname.startsWith('/api/admin/orders/') && pathname.endsWith('/status')) {
      const auth = this.authenticate(req, 'admin');
      if (!auth.authenticated) {
        return this.sendJson(res, auth.status, { error: auth.error });
      }

      const parts = pathname.split('/');
      const orderId = parts[4];
      const order = mockDb.orders.find(o => o._id === orderId);
      if (!order) {
        return this.sendJson(res, 404, { error: 'Order not found' });
      }

      let body;
      try {
        body = await this.parseRequestBody(req);
      } catch (err) {
        return this.sendJson(res, 400, { error: err.message });
      }

      const { status } = body || {};
      if (!status || typeof status !== 'string') {
        return this.sendJson(res, 400, { error: 'Status is required and must be a string' });
      }

      const validStatuses = ['Order Received', 'In Kitchen', 'Sent to Delivery', 'Delivered'];
      if (!validStatuses.includes(status)) {
        return this.sendJson(res, 400, { error: `Invalid status. Valid: ${validStatuses.join(', ')}` });
      }

      // Check for illegal regression if order is already delivered
      if (order.orderStatus === 'Delivered' && status !== 'Delivered') {
        return this.sendJson(res, 400, { error: 'Cannot change status of already delivered order' });
      }

      order.orderStatus = status;
      order.updatedAt = new Date().toISOString();

      this.broadcastToRoom(`order_${order._id}`, 'order_status_updated', {
        orderId: order._id,
        status: order.orderStatus,
        updatedAt: order.updatedAt
      });
      this.broadcastToRoom('admin_orders', 'order_status_updated', {
        orderId: order._id,
        status: order.orderStatus,
        updatedAt: order.updatedAt
      });

      return this.sendJson(res, 200, { order });
    }

    // 404 Catch-all
    return this.sendJson(res, 404, { error: `Route not found: ${method} ${pathname}` });
  }
}

export const mockServer = new MockServer();
export default mockServer;
