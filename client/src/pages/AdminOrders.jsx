// client/src/pages/AdminOrders.jsx
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Package, ChefHat, Bike, CheckCircle, Radio, RefreshCw, AlertCircle, Loader2 } from 'lucide-react';
import api from '../services/api';
import { useSocket } from '../context/SocketContext';

export default function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState(null);
  const { socket, joinAdminRoom } = useSocket();

  const fetchOrders = () => {
    setLoading(true);
    api.getAdminOrders()
      .then((data) => {
        setOrders(data || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load admin orders:', err);
        setError('Failed to fetch orders.');
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchOrders();
    joinAdminRoom();

    function handleNewOrder(newOrder) {
      console.log('[Admin] New order incoming:', newOrder);
      setOrders((prev) => [newOrder, ...prev]);
    }

    function handleStatusUpdate(data) {
      console.log('[Admin] Order status updated broadcast:', data);
      setOrders((prev) =>
        prev.map((ord) =>
          ord._id === data.orderId || ord._id === data._id
            ? { ...ord, orderStatus: data.status }
            : ord
        )
      );
    }

    if (socket) {
      socket.on('new_order_placed', handleNewOrder);
      socket.on('order_status_updated', handleStatusUpdate);
    }

    return () => {
      if (socket) {
        socket.off('new_order_placed', handleNewOrder);
        socket.off('order_status_updated', handleStatusUpdate);
      }
    };
  }, [socket]);

  const handleAdvanceStatus = async (orderId, nextStatus) => {
    setUpdatingId(orderId);
    try {
      const res = await api.updateOrderStatus(orderId, nextStatus);
      setOrders((prev) =>
        prev.map((ord) => (ord._id === orderId ? { ...ord, orderStatus: nextStatus } : ord))
      );
    } catch (err) {
      alert(`Could not transition status: ${err.message}`);
    } finally {
      setUpdatingId(null);
    }
  };

  const filteredOrders = orders.filter((o) => filter === 'all' || o.orderStatus === filter);

  return (
    <div className="container" style={{ padding: '36px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 style={{ fontSize: '26px', fontWeight: '800' }}>Live Kitchen Order Dispatch</h1>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
              fontWeight: '700',
              padding: '3px 8px',
              borderRadius: 'var(--radius-full)',
              background: '#fef0f1',
              color: 'var(--color-primary)'
            }}>
              <Radio size={12} className="animate-pulse" />
              <span>LIVE BROADCASTER</span>
            </span>
          </div>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>
            Transition orders through preparation stages to broadcast instant WebSocket updates to customers
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={fetchOrders} className="btn btn-outline btn-sm">
            <RefreshCw size={14} />
            <span>Refresh</span>
          </button>
          <Link to="/admin/inventory" className="btn btn-outline btn-sm">
            <Package size={14} />
            <span>Back to Inventory</span>
          </Link>
        </div>
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

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {['all', 'Order Received', 'In Kitchen', 'Sent to Delivery', 'Delivered'].map((st) => (
          <button
            key={st}
            onClick={() => setFilter(st)}
            className={`btn btn-sm ${filter === st ? 'btn-primary' : 'btn-outline'}`}
          >
            {st === 'all' ? 'All Orders' : st}
          </button>
        ))}
      </div>

      {/* Orders Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <Loader2 size={36} className="animate-spin" color="var(--color-primary)" style={{ margin: '0 auto 12px' }} />
          <p style={{ color: 'var(--color-text-muted)' }}>Retrieving kitchen orders...</p>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: '#fff', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
          <Package size={48} color="var(--color-text-muted)" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '6px' }}>No orders found</h3>
          <p style={{ color: 'var(--color-text-muted)' }}>Incoming orders will appear here automatically via WebSockets.</p>
        </div>
      ) : (
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Order ID & Time</th>
                <th>Customer Info</th>
                <th>Item Breakdown</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Status Progression Control</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((ord) => {
                const isUpdating = updatingId === ord._id;
                return (
                  <tr key={ord._id}>
                    <td>
                      <div style={{ fontWeight: '700' }}>#{ord._id.slice(-6).toUpperCase()}</div>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                        {new Date(ord.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: '600' }}>{ord.user?.name || ord.user?.email || 'Customer'}</div>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                        {typeof ord.deliveryAddress === 'string' ? ord.deliveryAddress : ord.deliveryAddress?.city}
                      </div>
                    </td>
                    <td>
                      {ord.items?.map((it, i) => (
                        <div key={i} style={{ fontSize: '13px' }}>
                          {it.quantity}x {it.pizza?.name || it.name || 'Custom Gourmet Pizza'}
                        </div>
                      ))}
                    </td>
                    <td style={{ fontWeight: '800', fontSize: '15px' }}>
                      ₹{ord.totalAmount}
                    </td>
                    <td>
                      <span className={`badge ${
                        ord.orderStatus === 'Order Received' ? 'badge-received' :
                        ord.orderStatus === 'In Kitchen' ? 'badge-kitchen' :
                        ord.orderStatus === 'Sent to Delivery' ? 'badge-delivery' :
                        'badge-delivered'
                      }`}>
                        {ord.orderStatus}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {ord.orderStatus === 'Order Received' && (
                          <button
                            onClick={() => handleAdvanceStatus(ord._id, 'In Kitchen')}
                            className="btn btn-primary btn-sm"
                            disabled={isUpdating}
                          >
                            <ChefHat size={14} />
                            <span>Start Kitchen</span>
                          </button>
                        )}

                        {ord.orderStatus === 'In Kitchen' && (
                          <button
                            onClick={() => handleAdvanceStatus(ord._id, 'Sent to Delivery')}
                            className="btn btn-outline btn-sm"
                            style={{ borderColor: 'var(--color-delivery)', color: 'var(--color-delivery)' }}
                            disabled={isUpdating}
                          >
                            <Bike size={14} />
                            <span>Dispatch Delivery</span>
                          </button>
                        )}

                        {ord.orderStatus === 'Sent to Delivery' && (
                          <button
                            onClick={() => handleAdvanceStatus(ord._id, 'Delivered')}
                            className="btn btn-success btn-sm"
                            disabled={isUpdating}
                          >
                            <CheckCircle size={14} />
                            <span>Mark Delivered</span>
                          </button>
                        )}

                        {ord.orderStatus === 'Delivered' && (
                          <span style={{ fontSize: '12px', color: 'var(--color-success)', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <CheckCircle size={14} />
                            <span>Completed</span>
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

