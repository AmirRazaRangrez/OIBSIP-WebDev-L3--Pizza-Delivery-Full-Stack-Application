// client/src/services/socket.js
import { io } from 'socket.io-client';

let socket = null;

export function getSocket() {
  if (!socket) {
    const socketTarget = import.meta.env.VITE_BACKEND_URL || window.location.origin;
    socket = io(socketTarget, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
    });

    socket.on('connect', () => {
      console.log('[Socket] Connected to realtime event bus:', socket.id);
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
    });
  }
  return socket;
}

export function joinOrderRoom(orderId) {
  const s = getSocket();
  if (s && orderId) {
    s.emit('join_order', orderId);
    s.emit('join_room', `order_${orderId}`);
  }
}

export function joinAdminRoom() {
  const s = getSocket();
  if (s) {
    s.emit('join_admin');
    s.emit('join_room', 'admin_orders');
  }
}

