// e2e_tests/helpers/socketClient.js
import EventEmitter from 'node:events';
import { config } from '../config.js';

export class SocketClient extends EventEmitter {
  constructor(url = config.wsUrl) {
    super();
    this.url = url;
    this.connected = false;
    this.rooms = new Set();
    this.boundMockServer = null;
  }

  // Bind directly to in-memory mock server if running in mock/auto mode
  bindMockServer(mockServer) {
    this.boundMockServer = mockServer;
  }

  async connect() {
    this.connected = true;
    if (this.boundMockServer) {
      this.boundMockServer.registerClient(this);
    }
    this.emit('connect');
    return this;
  }

  emitToServer(event, data) {
    if (!this.connected) throw new Error('Socket not connected');
    if (this.boundMockServer) {
      this.boundMockServer.handleClientEvent(this, event, data);
    }
  }

  joinOrder(orderId) {
    this.rooms.add(`order_${orderId}`);
    this.emitToServer('join_order', orderId);
  }

  joinRoom(roomName) {
    this.rooms.add(roomName);
    this.emitToServer('join_room', roomName);
  }

  // Receive event from server/bus
  receiveFromServer(event, payload) {
    this.emit(event, payload);
  }

  waitForEvent(event, timeoutMs = 3000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for socket event '${event}' after ${timeoutMs}ms`));
      }, timeoutMs);

      this.once(event, (data) => {
        clearTimeout(timer);
        resolve(data);
      });
    });
  }

  disconnect() {
    this.connected = false;
    this.rooms.clear();
    if (this.boundMockServer) {
      this.boundMockServer.unregisterClient(this);
    }
    this.emit('disconnect');
  }
}

export default SocketClient;

