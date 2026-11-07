// client/src/components/Navbar.jsx
import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Pizza, ShoppingBag, User, LogOut, ShieldCheck, Clock, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, cart, isAuthenticated, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const totalCartCount = cart.reduce((acc, item) => acc + (item.quantity || 1), 0);

  return (
    <header className="zomato-navbar">
      <div className="container navbar-inner">
        {/* Brand Logo */}
        <Link to="/" className="nav-brand">
          <span>zomato</span>
          <span style={{ color: 'var(--color-secondary)', fontWeight: 800 }}>pizza</span>
          <span className="tagline">Official</span>
        </Link>

        {/* Navigation Items */}
        <nav className="nav-links">
          <Link
            to="/"
            className={`nav-item ${location.pathname === '/' ? 'active' : ''}`}
          >
            <Pizza size={18} />
            <span>Menu</span>
          </Link>

          <Link
            to="/build-pizza"
            className={`nav-item ${location.pathname === '/build-pizza' ? 'active' : ''}`}
          >
            <Sparkles size={18} />
            <span>Custom Pizza</span>
          </Link>

          {isAuthenticated && (
            <Link
              to="/my-orders"
              className={`nav-item ${location.pathname === '/my-orders' ? 'active' : ''}`}
            >
              <Clock size={18} />
              <span>Track Orders</span>
            </Link>
          )}

          {/* Cart CTA */}
          <Link to="/order-summary" className="cart-btn">
            <ShoppingBag size={18} />
            <span>Cart</span>
            {totalCartCount > 0 && <span className="cart-badge">{totalCartCount}</span>}
          </Link>

          {/* Admin Switcher */}
          {isAdmin ? (
            <Link to="/admin/inventory" className="admin-switch-btn">
              <ShieldCheck size={16} color="var(--color-primary)" />
              <span>Admin Portal</span>
            </Link>
          ) : (
            <Link to="/admin/login" className="admin-switch-btn">
              <ShieldCheck size={16} />
              <span>Admin</span>
            </Link>
          )}

          {/* Auth State */}
          {isAuthenticated ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--color-text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <User size={16} />
                {user.name || user.email?.split('@')[0]}
              </span>
              <button
                onClick={handleLogout}
                className="btn btn-outline btn-sm"
                title="Log out"
                style={{ padding: '6px 10px' }}
              >
                <LogOut size={14} />
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Link to="/login" className="btn btn-outline btn-sm">
                Log in
              </Link>
              <Link to="/register" className="btn btn-primary btn-sm">
                Sign up
              </Link>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}

