const { Server } = require('socket.io');

let io = null;

/**
 * Initializes Socket.io attached to the node HTTP server.
 * Configures CORS, event listeners, and room joins.
 */
function initSocket(server) {
  const allowedOrigins = [
    process.env.CLIENT_URL || 'http://localhost:3000',
    'http://localhost:5173'
  ];

  io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, curl, or test clients)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin) || process.env.CLIENT_URL === '*' || !process.env.CLIENT_URL) {
          return callback(null, true);
        }
        return callback(null, true); // Permissive in dev/test mode
      },
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      credentials: true
    }
  });

  io.on('connection', (socket) => {
    // 1. Consumer Room: Order Tracking
    socket.on('join_order', (orderId) => {
      if (orderId && typeof orderId === 'string') {
        const room = `order_${orderId}`;
        socket.join(room);
      }
    });

    socket.on('leave_order', (orderId) => {
      if (orderId && typeof orderId === 'string') {
        socket.leave(`order_${orderId}`);
      }
    });

    // 2. Admin Room: Order Monitoring
    socket.on('join_admin', () => {
      socket.join('admin_orders');
    });

    // 3. Generic Room Support (used by E2E test client socket.joinRoom)
    socket.on('join_room', (roomName) => {
      if (roomName && typeof roomName === 'string') {
        socket.join(roomName);
      }
    });

    // 4. Safe Error & Disconnect Handlers
    socket.on('error', (err) => {
      // Graceful error logging without server termination
      console.warn('[WebSocket] Socket error:', err.message);
    });

    socket.on('disconnect', () => {});
  });

  return io;
}

/**
 * Returns active io instance.
 */
function getIO() {
  if (!io) {
    throw new Error('Socket.io has not been initialized. Call initSocket(server) first.');
  }
  return io;
}

/**
 * Broadcasts order progression to consumer and admin channels.
 * Target rooms: `order_<orderId>` and `admin_orders`
 * Event: `order_status_updated`
 */
function broadcastOrderStatus(orderId, status, updatedAt = new Date().toISOString()) {
  if (!io) return;
  const payload = {
    orderId: orderId.toString(),
    status,
    updatedAt
  };
  io.to(`order_${orderId}`).emit('order_status_updated', payload);
  io.to('admin_orders').emit('order_status_updated', payload);
}

/**
 * Broadcasts stock modification to all connected clients.
 * Target: Global broadcast (io.emit)
 * Event: `inventory_updated`
 */
function broadcastInventoryUpdate(itemId, stock) {
  if (!io) return;
  io.emit('inventory_updated', {
    inventoryId: itemId.toString(),
    currentStock: Number(stock)
  });
}

/**
 * Broadcasts new incoming paid order to administrative board.
 * Target room: `admin_orders`
 * Event: `new_order_placed`
 */
function broadcastNewOrder(order) {
  if (!io) return;
  io.to('admin_orders').emit('new_order_placed', {
    orderId: order._id.toString(),
    total: order.totalAmount,
    order
  });
}

module.exports = {
  initSocket,
  getIO,
  broadcastOrderStatus,
  broadcastInventoryUpdate,
  broadcastNewOrder
};
