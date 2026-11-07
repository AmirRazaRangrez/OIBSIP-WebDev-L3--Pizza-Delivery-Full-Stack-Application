// client/src/App.jsx
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';

// User Pages
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Register from './pages/Register';
import VerifyEmail from './pages/VerifyEmail';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import PizzaBuilder from './pages/PizzaBuilder';
import OrderSummary from './pages/OrderSummary';
import OrderTracking from './pages/OrderTracking';
import MyOrders from './pages/MyOrders';

// Admin Pages
import AdminLogin from './pages/AdminLogin';
import AdminInventory from './pages/AdminInventory';
import AdminOrders from './pages/AdminOrders';

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Navbar />
        <main style={{ flex: 1 }}>
          <Routes>
            {/* Public Consumer Routes */}
            <Route path="/" element={<Dashboard />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/build-pizza" element={<PizzaBuilder />} />
            <Route path="/order-summary" element={<OrderSummary />} />

            {/* Customer Protected Routes */}
            <Route
              path="/order-tracking/:id"
              element={
                <ProtectedRoute>
                  <OrderTracking />
                </ProtectedRoute>
              }
            />
            <Route
              path="/my-orders"
              element={
                <ProtectedRoute>
                  <MyOrders />
                </ProtectedRoute>
              }
            />

            {/* Admin Isolated Routes */}
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route
              path="/admin/inventory"
              element={
                <ProtectedRoute adminOnly={true}>
                  <AdminInventory />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/orders"
              element={
                <ProtectedRoute adminOnly={true}>
                  <AdminOrders />
                </ProtectedRoute>
              }
            />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

