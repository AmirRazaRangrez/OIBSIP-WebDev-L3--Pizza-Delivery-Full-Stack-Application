// client/src/components/Navbar.jsx
import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Pizza,
  ShoppingBag,
  User,
  LogOut,
  ShieldCheck,
  Clock,
  Sparkles,
  ChefHat,
  Boxes,
  Menu as MenuIcon,
  X as CloseIcon
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, cart, isAuthenticated, isAdmin, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Close mobile drawer whenever location changes
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    setMobileMenuOpen(false);
    logout();
    navigate('/login');
  };

  const totalCartCount = cart.reduce((acc, item) => acc + (item.quantity || 1), 0);

  return (
    <>
      <header className="zomato-navbar">
        <div className="container navbar-inner">
          {/* Brand Logo */}
          <Link to="/" className="nav-brand" onClick={() => setMobileMenuOpen(false)}>
            <span>pizzo</span>
            <span style={{ color: 'var(--color-secondary)', fontWeight: 800 }}>by raza</span>
            <span className="tagline">Official</span>
          </Link>

          {/* Desktop Navigation Items (Hidden on Mobile) */}
          <nav className="nav-links desktop-nav">
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

            {/* If Admin: Direct Links to Kitchen Orders & Inventory */}
            {isAdmin ? (
              <>
                <Link
                  to="/admin/orders"
                  className={`nav-item ${location.pathname === '/admin/orders' ? 'active' : ''}`}
                  style={{ color: 'var(--color-primary)', fontWeight: 700 }}
                >
                  <ChefHat size={18} />
                  <span>Kitchen Orders</span>
                </Link>

                <Link
                  to="/admin/inventory"
                  className={`nav-item ${location.pathname === '/admin/inventory' ? 'active' : ''}`}
                >
                  <Boxes size={18} />
                  <span>Inventory</span>
                </Link>
              </>
            ) : (
              isAuthenticated && (
                <Link
                  to="/my-orders"
                  className={`nav-item ${location.pathname === '/my-orders' ? 'active' : ''}`}
                >
                  <Clock size={18} />
                  <span>Track Orders</span>
                </Link>
              )
            )}

            {/* Cart CTA */}
            <Link to="/order-summary" className="cart-btn">
              <ShoppingBag size={18} />
              <span>Cart</span>
              {totalCartCount > 0 && <span className="cart-badge">{totalCartCount}</span>}
            </Link>

            {/* Admin Switcher when not logged in as Admin */}
            {!isAdmin && (
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
                  {isAdmin ? 'System Admin' : user.name || user.email?.split('@')[0]}
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

          {/* Mobile Right Controls (Visible only on mobile screens) */}
          <div className="mobile-actions">
            <Link to="/order-summary" className="mobile-cart-icon" aria-label="Cart">
              <ShoppingBag size={20} />
              {totalCartCount > 0 && <span className="cart-badge-dot">{totalCartCount}</span>}
            </Link>

            <button
              className="mobile-hamburger-btn"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle Navigation Menu"
            >
              {mobileMenuOpen ? <CloseIcon size={24} /> : <MenuIcon size={24} />}
            </button>
          </div>
        </div>

        {/* Mobile Slide-down Drawer */}
        {mobileMenuOpen && (
          <div className="mobile-nav-drawer">
            <div className="mobile-nav-links">
              <Link
                to="/"
                className={`mobile-nav-item ${location.pathname === '/' ? 'active' : ''}`}
                onClick={() => setMobileMenuOpen(false)}
              >
                <Pizza size={18} />
                <span>Menu (Gourmet Pizzas)</span>
              </Link>

              <Link
                to="/build-pizza"
                className={`mobile-nav-item ${location.pathname === '/build-pizza' ? 'active' : ''}`}
                onClick={() => setMobileMenuOpen(false)}
              >
                <Sparkles size={18} />
                <span>Custom Pizza Builder</span>
              </Link>

              {isAdmin ? (
                <>
                  <Link
                    to="/admin/orders"
                    className={`mobile-nav-item ${location.pathname === '/admin/orders' ? 'active' : ''} admin-highlight`}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <ChefHat size={18} />
                    <span>Kitchen Orders Dashboard</span>
                  </Link>
                  <Link
                    to="/admin/inventory"
                    className={`mobile-nav-item ${location.pathname === '/admin/inventory' ? 'active' : ''}`}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Boxes size={18} />
                    <span>Inventory Management</span>
                  </Link>
                </>
              ) : (
                isAuthenticated && (
                  <Link
                    to="/my-orders"
                    className={`mobile-nav-item ${location.pathname === '/my-orders' ? 'active' : ''}`}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Clock size={18} />
                    <span>My Orders & Live Tracking</span>
                  </Link>
                )
              )}

              <Link
                to="/order-summary"
                className={`mobile-nav-item ${location.pathname === '/order-summary' ? 'active' : ''}`}
                onClick={() => setMobileMenuOpen(false)}
              >
                <ShoppingBag size={18} />
                <span>Cart ({totalCartCount} items)</span>
              </Link>

              <div className="mobile-divider" />

              {!isAdmin && (
                <Link
                  to="/admin/login"
                  className="mobile-nav-item"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <ShieldCheck size={18} />
                  <span>Admin / Kitchen Staff Login</span>
                </Link>
              )}

              <div className="mobile-divider" />

              {isAuthenticated ? (
                <div className="mobile-user-box">
                  <div className="mobile-user-info">
                    <User size={18} />
                    <div>
                      <div style={{ fontWeight: '700' }}>
                        {isAdmin ? 'System Admin' : user.name || 'Customer'}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                        {user.email}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="btn btn-outline btn-sm"
                    style={{ width: '100%', justifyContent: 'center', marginTop: '10px' }}
                  >
                    <LogOut size={16} />
                    <span>Sign Out</span>
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                  <Link
                    to="/login"
                    className="btn btn-outline"
                    style={{ flex: 1, justifyContent: 'center' }}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Log in
                  </Link>
                  <Link
                    to="/register"
                    className="btn btn-primary"
                    style={{ flex: 1, justifyContent: 'center' }}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Sign up
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Mobile Sticky Bottom Navigation Bar */}
      <nav className="mobile-bottom-bar">
        <Link
          to="/"
          className={`mobile-bottom-item ${location.pathname === '/' ? 'active' : ''}`}
        >
          <Pizza size={20} />
          <span>Menu</span>
        </Link>

        <Link
          to="/build-pizza"
          className={`mobile-bottom-item ${location.pathname === '/build-pizza' ? 'active' : ''}`}
        >
          <Sparkles size={20} />
          <span>Custom</span>
        </Link>

        <Link
          to="/order-summary"
          className={`mobile-bottom-item ${location.pathname === '/order-summary' ? 'active' : ''}`}
        >
          <div style={{ position: 'relative', display: 'inline-flex' }}>
            <ShoppingBag size={20} />
            {totalCartCount > 0 && <span className="bottom-cart-badge">{totalCartCount}</span>}
          </div>
          <span>Cart</span>
        </Link>

        {isAdmin ? (
          <Link
            to="/admin/orders"
            className={`mobile-bottom-item ${location.pathname === '/admin/orders' ? 'active' : ''}`}
          >
            <ChefHat size={20} color="var(--color-primary)" />
            <span>Kitchen</span>
          </Link>
        ) : isAuthenticated ? (
          <Link
            to="/my-orders"
            className={`mobile-bottom-item ${location.pathname === '/my-orders' ? 'active' : ''}`}
          >
            <Clock size={20} />
            <span>Orders</span>
          </Link>
        ) : (
          <Link
            to="/login"
            className={`mobile-bottom-item ${location.pathname === '/login' ? 'active' : ''}`}
          >
            <User size={20} />
            <span>Login</span>
          </Link>
        )}

        {isAdmin ? (
          <Link
            to="/admin/inventory"
            className={`mobile-bottom-item ${location.pathname === '/admin/inventory' ? 'active' : ''}`}
          >
            <Boxes size={20} />
            <span>Stock</span>
          </Link>
        ) : (
          <Link
            to="/admin/login"
            className={`mobile-bottom-item ${location.pathname === '/admin/login' ? 'active' : ''}`}
          >
            <ShieldCheck size={20} />
            <span>Admin</span>
          </Link>
        )}
      </nav>
    </>
  );
}
