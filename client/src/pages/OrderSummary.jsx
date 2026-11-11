// client/src/pages/OrderSummary.jsx
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Trash2, CreditCard, ShoppingBag, AlertCircle, ArrowLeft, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

export default function OrderSummary() {
  const { cart, removeFromCart, clearCart, isAuthenticated, user } = useAuth();
  const [deliveryAddress, setDeliveryAddress] = useState('Flat 402, Royal Palms, High Street, Mumbai, 400001');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const subtotal = cart.reduce((acc, item) => acc + (item.price * (item.quantity || 1)), 0);
  const grandTotal = subtotal; // Aligned with backend pricing engine (inclusive of taxes and free promotional delivery)

  const handlePayment = async () => {
    if (!isAuthenticated) {
      navigate('/login', { state: { from: { pathname: '/order-summary' } } });
      return;
    }

    if (cart.length === 0) {
      setError('Your cart is empty.');
      return;
    }

    if (!deliveryAddress.trim()) {
      setError('Please provide a delivery address.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // 1. Create Order and Razorpay Order on server
      const formattedItems = cart.map((item) => ({
        type: item.type,
        pizza: item.type === 'preconfigured' ? item.pizzaId : undefined,
        customDetails: item.type === 'custom' ? item.customDetails : undefined,
        quantity: item.quantity || 1,
        unitPrice: item.price
      }));

      const res = await api.createRazorpayOrder({
        items: formattedItems,
        deliveryAddress
      });

      const { orderId, razorpayOrderId, amount, currency, key } = res;

      // 2. Launch Razorpay modal if available in browser
      if (typeof window !== 'undefined' && window.Razorpay) {
        const options = {
          key: key || 'rzp_test_Twlntm5UkURGg0',
          amount: amount,
          currency: currency || 'INR',
          name: 'Zomato Pizza',
          description: `Order #${orderId}`,
          image: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=120&q=80',
          order_id: razorpayOrderId,
          handler: async function (response) {
            try {
              // 3. Verify Payment
              await api.verifyPayment({
                orderId,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature
              });

              clearCart();
              navigate(`/order-tracking/${orderId}`);
            } catch (vErr) {
              setError(vErr.message || 'Payment verification failed.');
              setLoading(false);
            }
          },
          prefill: {
            name: user?.name || 'Valued Gourmet',
            email: user?.email || 'customer@example.com',
            contact: '9876543210'
          },
          theme: {
            color: '#e23744'
          },
          modal: {
            ondismiss: function () {
              setLoading(false);
            }
          }
        };

        const rzp = new window.Razorpay(options);
        rzp.open();
      } else {
        // If Razorpay SDK is not yet ready, load it dynamically and retry
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.onload = () => {
          handlePayment();
        };
        script.onerror = () => {
          setError('Could not load Razorpay payment gateway. Please disable ad-blockers or check your internet connection.');
          setLoading(false);
        };
        document.body.appendChild(script);
      }
    } catch (err) {
      setError(err.message || 'Failed to initiate checkout. Please try again.');
      setLoading(false);
    }
  };

  if (cart.length === 0) {
    return (
      <div className="container" style={{ textAlign: 'center', padding: '100px 20px' }}>
        <ShoppingBag size={56} color="var(--color-primary)" style={{ margin: '0 auto 16px' }} />
        <h2 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '8px' }}>Your Cart is Empty</h2>
        <p style={{ color: 'var(--color-text-muted)', marginBottom: '24px' }}>
          Explore our menu and build the pizza of your dreams!
        </p>
        <Link to="/" className="btn btn-primary btn-lg">
          Explore Pizzas
        </Link>
      </div>
    );
  }

  return (
    <div className="container" style={{ padding: '40px 20px' }}>
      <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button onClick={() => navigate(-1)} className="btn btn-outline btn-sm">
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>
        <h1 style={{ fontSize: '26px', fontWeight: '800' }}>Order Summary & Checkout</h1>
      </div>

      {error && (
        <div style={{
          background: '#ffebee',
          color: '#c62828',
          padding: '12px 16px',
          borderRadius: 'var(--radius-md)',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '28px' }}>
        {/* Left: Cart Items */}
        <div>
          <div className="summary-card">
            <h3 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '16px' }}>
              Selected Pizzas ({cart.length})
            </h3>

            {cart.map((item, index) => (
              <div key={index} className="order-item-row">
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '700', fontSize: '15px' }}>{item.name}</div>
                  {item.summary && (
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                      Base: {item.summary.baseName} | Sauce: {item.summary.sauceName} | Cheese: {item.summary.cheeseName}
                      {item.summary.veggieNames?.length > 0 && (
                        <div>Veggies: {item.summary.veggieNames.join(', ')}</div>
                      )}
                    </div>
                  )}
                  <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                    Qty: {item.quantity || 1}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ fontWeight: '800', fontSize: '16px' }}>
                    ₹{item.price * (item.quantity || 1)}
                  </div>
                  <button
                    onClick={() => removeFromCart(index)}
                    style={{ color: 'var(--color-danger)', cursor: 'pointer' }}
                    title="Remove item"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Delivery Address */}
          <div className="summary-card">
            <h3 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '12px' }}>
              Delivery Destination
            </h3>
            <div className="form-group">
              <label className="form-label">Delivery Address & Instructions</label>
              <textarea
                className="form-control"
                rows="3"
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                placeholder="House / Flat No, Landmark, City, Postal Code"
                required
              />
            </div>
          </div>
        </div>

        {/* Right: Bill Breakdown & Razorpay Pay Button */}
        <div>
          <div className="summary-card">
            <h3 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '16px' }}>
              Payment Details
            </h3>

            <div className="price-breakdown">
              <div className="price-line">
                <span>Items Subtotal</span>
                <span>₹{subtotal}</span>
              </div>
              <div className="price-line">
                <span>GST (Taxes)</span>
                <span style={{ color: 'var(--color-success)', fontWeight: '600' }}>Inclusive</span>
              </div>
              <div className="price-line">
                <span>Delivery Charge</span>
                <strong style={{ color: 'var(--color-success)' }}>FREE</strong>
              </div>
              <div className="price-line total">
                <span>Total Payable</span>
                <span>₹{grandTotal}</span>
              </div>
            </div>

            <div style={{
              background: '#f8f9fa',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: '12px',
              margin: '20px 0',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '12px',
              color: 'var(--color-text-muted)'
            }}>
              <ShieldCheck size={20} color="var(--color-primary)" />
              <span>
                Protected by <strong>Razorpay Test Sandbox</strong> (`rzp_test_Twlntm5UkURGg0`). Instant automated confirmation.
              </span>
            </div>

            <button
              onClick={handlePayment}
              className="btn btn-primary btn-lg"
              style={{ width: '100%' }}
              disabled={loading}
            >
              <CreditCard size={18} />
              <span>{loading ? 'Connecting to Razorpay...' : `Pay ₹${grandTotal} via Razorpay`}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

