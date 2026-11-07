// client/src/context/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('pizza_token') || null);
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('pizza_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [cart, setCart] = useState(() => {
    const saved = localStorage.getItem('pizza_cart');
    return saved ? JSON.parse(saved) : [];
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    localStorage.setItem('pizza_cart', JSON.stringify(cart));
  }, [cart]);

  const login = async (credentials) => {
    setLoading(true);
    try {
      const res = await api.login(credentials);
      setToken(res.token);
      setUser(res.user);
      localStorage.setItem('pizza_token', res.token);
      localStorage.setItem('pizza_user', JSON.stringify(res.user));
      return res;
    } finally {
      setLoading(false);
    }
  };

  const adminLogin = async (credentials) => {
    setLoading(true);
    try {
      const res = await api.adminLogin(credentials);
      const adminUser = res.admin || { ...res.user, role: 'admin' };
      setToken(res.token);
      setUser(adminUser);
      localStorage.setItem('pizza_token', res.token);
      localStorage.setItem('pizza_user', JSON.stringify(adminUser));
      return res;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('pizza_token');
    localStorage.removeItem('pizza_user');
  };

  const addToCart = (item) => {
    setCart((prev) => [...prev, item]);
  };

  const removeFromCart = (index) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  const clearCart = () => {
    setCart([]);
    localStorage.removeItem('pizza_cart');
  };

  const isAuthenticated = !!token && !!user;
  const isAdmin = user?.role === 'admin';

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        cart,
        loading,
        isAuthenticated,
        isAdmin,
        login,
        adminLogin,
        logout,
        addToCart,
        removeFromCart,
        clearCart
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

