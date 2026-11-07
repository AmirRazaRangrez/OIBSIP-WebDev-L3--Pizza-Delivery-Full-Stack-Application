// client/src/pages/OrderTracking.jsx
import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { PackageCheck, ChefHat, Bike, CheckCircle2, Clock, MapPin, Radio, Loader2 } from 'lucide-react';
import api from '../services/api';
import { useSocket } from '../context/SocketContext';

const STAGES = [
  { key: 'Order Received', label: 'Order Received', icon: PackageCheck },
  { key: 'In Kitchen', label: 'In Kitchen', icon: ChefHat },
  { key: 'Sent to Delivery', label: 'Out for Delivery', icon: Bike },
  { key: 'Delivered', label: 'Delivered', icon: CheckCircle2 }
];

export default function OrderTracking() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { socket, joinOrderRoom } = useSocket();

  useEffect(() => {
    let isMounted = true;
    api.getOrderById(id)
      .then((data) => {
        if (isMounted) {
          setOrder(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to fetch order details:', err);
        if (isMounted) {
          setError(err.message || 'Order not found.');
          setLoading(false);
        }
      });

    // Join isolated room for this order
    joinOrderRoom(id);

    // Listen for live status transitions
    function handleStatusUpdate(data) {
      if (data && (data.orderId === id || data._id === id)) {
        console.log('[Tracking] Live status update received:', data.status);
        setOrder((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            orderStatus: data.status,
            statusHistory: data.statusHistory || prev.statusHistory
          };
        });
      }
    }

    if (socket) {
      socket.on('order_status_updated', handleStatusUpdate);
    }

    return () => {
      isMounted = false;
      if (socket) {
        socket.off('order_status_updated', handleStatusUpdate);
      }
    };
  }, [id, socket]);

  if (loading) {
    return (
      <div className="container" style={{ textAlign: 'center', padding: '100px 0' }}>
        <Loader2 size={40} className="animate-spin" color="var(--color-primary)" style={{ margin: '0 auto 16px' }} />
        <h3>Locating your order live telemetry...</h3>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="container" style={{ textAlign: 'center', padding: '100px 20px' }}>
        <h2>Order Not Found</h2>
        <p style={{ color: 'var(--color-text-muted)', marginBottom: '20px' }}>{error || 'Unable to locate order.'}</p>
        <Link to="/" className="btn btn-primary">Return to Menu</Link>
      </div>
    );
  }

  const currentStatus = order.orderStatus || 'Order Received';
  const currentStageIndex = STAGES.findIndex((s) => s.key === currentStatus);

  return (
    <div className="container" style={{ padding: '40px 20px' }}>
      <div className="tracking-wrapper">
        <div className="tracking-header">
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: 'var(--color-primary-light)',
            color: 'var(--color-primary)',
            padding: '4px 12px',
            borderRadius: 'var(--radius-full)',
            fontSize: '12px',
            fontWeight: '700',
            marginBottom: '12px'
          }}>
            <Radio size={14} className="animate-pulse" />
            <span>LIVE REAL-TIME TRACKING</span>
          </div>
          <h2>Live Order Progression</h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>
            Order ID: <strong>{order._id}</strong>
          </p>
        </div>

        {/* 4-Stage Stepper */}
        <div className="stepper">
          {STAGES.map((stage, idx) => {
            const Icon = stage.icon;
            const isCompleted = idx < currentStageIndex;
            const isActive = idx === currentStageIndex;

            return (
              <div
                key={stage.key}
                className={`step-node ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
              >
                <div className="step-icon">
                  <Icon size={20} />
                </div>
                <span className="step-label">{stage.label}</span>
              </div>
            );
          })}
        </div>

        {/* Status Callout Box */}
        <div style={{
          background: '#fafafa',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          padding: '20px',
          textAlign: 'center',
          marginBottom: '28px'
        }}>
          <h3 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--color-primary)', marginBottom: '6px' }}>
            {currentStatus === 'Order Received' && 'We have received your order!'}
            {currentStatus === 'In Kitchen' && 'Our chefs are crafting your pizza!'}
            {currentStatus === 'Sent to Delivery' && 'Your pizza is on the way!'}
            {currentStatus === 'Delivered' && 'Pizza has been delivered! Enjoy!'}
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
            Estimated time: {currentStatus === 'Delivered' ? 'Completed' : '20 - 30 minutes'}
          </p>
        </div>

        {/* Order Details Breakdown */}
        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '20px' }}>
          <h4 style={{ fontSize: '15px', fontWeight: '800', marginBottom: '14px' }}>
            Items in this order:
          </h4>
          {order.items?.map((item, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '8px' }}>
              <span>
                {item.quantity}x {item.pizza?.name || item.name || 'Custom Gourmet Pizza'}
              </span>
              <span style={{ fontWeight: '700' }}>₹{item.subtotal || item.unitPrice * item.quantity}</span>
            </div>
          ))}

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            borderTop: '1px solid var(--color-border)',
            paddingTop: '10px',
            marginTop: '12px',
            fontWeight: '800',
            fontSize: '16px'
          }}>
            <span>Total Paid (via Razorpay):</span>
            <span style={{ color: 'var(--color-primary)' }}>₹{order.totalAmount}</span>
          </div>

          {order.deliveryAddress && (
            <div style={{
              display: 'flex',
              gap: '8px',
              marginTop: '20px',
              fontSize: '13px',
              color: 'var(--color-text-muted)'
            }}>
              <MapPin size={16} color="var(--color-primary)" style={{ flexShrink: 0, marginTop: '2px' }} />
              <span>
                {typeof order.deliveryAddress === 'string'
                  ? order.deliveryAddress
                  : `${order.deliveryAddress.street || ''}, ${order.deliveryAddress.city || ''}`}
              </span>
            </div>
          )}
        </div>

        <div style={{ textAlign: 'center', marginTop: '30px' }}>
          <Link to="/" className="btn btn-outline" style={{ width: '100%' }}>
            Order More Pizzas
          </Link>
        </div>
      </div>
    </div>
  );
}

