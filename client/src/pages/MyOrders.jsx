// client/src/pages/MyOrders.jsx
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Eye, AlertCircle, Loader2, ShoppingBag } from 'lucide-react';
import api from '../services/api';

export default function MyOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;
    api.getMyOrders()
      .then((data) => {
        if (isMounted) {
          setOrders(data || []);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to load my orders:', err);
        if (isMounted) {
          setError(err.message || 'Failed to load order history.');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'Order Received': return 'badge-received';
      case 'In Kitchen': return 'badge-kitchen';
      case 'Sent to Delivery': return 'badge-delivery';
      case 'Delivered': return 'badge-delivered';
      default: return 'badge-received';
    }
  };

  return (
    <div className="container" style={{ padding: '40px 20px' }}>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: '800' }}>My Pizza Orders</h1>
        <p style={{ color: 'var(--color-text-muted)' }}>
          Review and live track your handcrafted deliveries
        </p>
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

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <Loader2 size={36} className="animate-spin" color="var(--color-primary)" style={{ margin: '0 auto 12px' }} />
          <p style={{ color: 'var(--color-text-muted)' }}>Fetching your order history...</p>
        </div>
      ) : orders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: '#fff', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
          <ShoppingBag size={48} color="var(--color-text-muted)" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '8px' }}>No orders placed yet</h3>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: '20px' }}>
            Ready to order something delicious?
          </p>
          <Link to="/" className="btn btn-primary">
            Explore Menu
          </Link>
        </div>
      ) : (
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Date & Time</th>
                <th>Items</th>
                <th>Total</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((ord) => (
                <tr key={ord._id}>
                  <td style={{ fontWeight: '700' }}>#{ord._id.slice(-6).toUpperCase()}</td>
                  <td style={{ color: 'var(--color-text-muted)' }}>
                    {new Date(ord.createdAt).toLocaleDateString()} at {new Date(ord.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td>
                    {ord.items?.map((it, idx) => (
                      <div key={idx} style={{ fontSize: '13px' }}>
                        {it.quantity}x {it.pizza?.name || it.name || 'Custom Pizza'}
                      </div>
                    ))}
                  </td>
                  <td style={{ fontWeight: '800' }}>₹{ord.totalAmount}</td>
                  <td>
                    <span className={`badge ${getStatusBadgeClass(ord.orderStatus)}`}>
                      {ord.orderStatus}
                    </span>
                  </td>
                  <td>
                    <Link to={`/order-tracking/${ord._id}`} className="btn btn-outline btn-sm">
                      <Eye size={14} />
                      <span>Live Track</span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

