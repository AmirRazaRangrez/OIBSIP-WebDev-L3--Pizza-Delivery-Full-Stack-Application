// e2e_tests/helpers/testContext.js
import { config } from '../config.js';
import { ApiClient } from './apiClient.js';
import { SocketClient } from './socketClient.js';
import { mockServer } from '../mock-server/server.js';
import { mockDb } from '../mock-server/mockDb.js';

let activeServer = null;
let activeClient = null;
let activeSocket = null;
let isMockMode = false;

export async function setupTestEnvironment() {
  if (activeClient) {
    return { client: activeClient, socket: activeSocket, isMockMode, mockServer, mockDb };
  }

  // Check if live server is reachable
  let liveServerReachable = false;
  if (config.testMode !== 'mock') {
    try {
      const probeClient = new ApiClient(config.baseUrl);
      const res = await probeClient.get('/api/inventory');
      if (res.status === 200 || res.status === 401 || res.status === 403 || res.status === 404) {
        liveServerReachable = true;
      }
    } catch {
      liveServerReachable = false;
    }
  }

  if (liveServerReachable && config.testMode !== 'mock') {
    isMockMode = false;
    activeClient = new ApiClient(config.baseUrl);
    activeSocket = new SocketClient(config.wsUrl);
    await activeSocket.connect();
  } else {
    // Start contract mock server
    isMockMode = true;
    mockDb.reset();
    const serverUrl = await mockServer.start(0);
    activeServer = mockServer;
    activeClient = new ApiClient(serverUrl);
    activeSocket = new SocketClient(serverUrl);
    activeSocket.bindMockServer(mockServer);
    await activeSocket.connect();
  }

  return {
    client: activeClient,
    socket: activeSocket,
    isMockMode,
    mockServer: activeServer,
    mockDb
  };
}

export async function teardownTestEnvironment() {
  if (activeSocket) {
    activeSocket.disconnect();
    activeSocket = null;
  }
  if (activeServer) {
    await activeServer.stop();
    activeServer = null;
  }
  activeClient = null;
}

