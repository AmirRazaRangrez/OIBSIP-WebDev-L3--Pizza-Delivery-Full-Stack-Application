// client/src/context/SocketContext.jsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { getSocket, joinOrderRoom, joinAdminRoom } from '../services/socket';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const [connected, setConnected] = useState(false);
  const socket = getSocket();

  useEffect(() => {
    if (!socket) return;

    function handleConnect() {
      setConnected(true);
    }
    function handleDisconnect() {
      setConnected(false);
    }

    if (socket.connected) {
      setConnected(true);
    }

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, [socket]);

  return (
    <SocketContext.Provider value={{ socket, connected, joinOrderRoom, joinAdminRoom }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return ctx;
}

