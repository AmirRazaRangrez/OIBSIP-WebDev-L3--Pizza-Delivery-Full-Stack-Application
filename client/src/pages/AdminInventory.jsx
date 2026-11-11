// client/src/pages/AdminInventory.jsx
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Package, AlertTriangle, Layers, Edit3, ShoppingCart, Radio, RefreshCw, Loader2 } from 'lucide-react';
import api from '../services/api';
import { useSocket } from '../context/SocketContext';
import ManualStockModal from './ManualStockModal';

export default function AdminInventory() {
  const [items, setItems] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [activeItem, setActiveItem] = useState(null);
  const { socket, joinAdminRoom } = useSocket();

  const fetchInventory = () => {
    setLoading(true);
    api.getInventory()
      .then((data) => {
        setItems(data || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load inventory:', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchInventory();
    joinAdminRoom();

    function handleInventoryUpdated(data) {
      console.log('[Admin] Inventory update received over socket:', data);
      if (data) {
        const id = data.inventoryId || data.itemId || data._id;
        const newStock = data.currentStock !== undefined ? data.currentStock : data.stock;
        if (id && newStock !== undefined) {
          setItems((prev) =>
            prev.map((it) => (it._id === id ? { ...it, stock: newStock } : it))
          );
        }
      }
    }

    if (socket) {
      socket.on('inventory_updated', handleInventoryUpdated);
    }

    return () => {
      if (socket) {
        socket.off('inventory_updated', handleInventoryUpdated);
      }
    };
  }, [socket]);

  const filteredItems = items.filter(
    (item) => categoryFilter === 'all' || item.category === categoryFilter
  );

  const lowStockCount = items.filter((it) => it.stock < (it.threshold || 20)).length;
  const totalStockUnits = items.reduce((acc, it) => acc + (it.stock || 0), 0);

  return (
    <div className="container" style={{ padding: '36px 20px' }}>
      {/* Admin Subheader & Tab Switcher */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 style={{ fontSize: '26px', fontWeight: '800' }}>Admin Inventory Console</h1>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
              fontWeight: '700',
              padding: '3px 8px',
              borderRadius: 'var(--radius-full)',
              background: '#edfaf1',
              color: 'var(--color-success)'
            }}>
              <Radio size={12} className="animate-pulse" />
              <span>LIVE SYNC</span>
            </span>
          </div>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>
            Monitor real-time ingredient levels, adjust supply, and prevent kitchen stock-outs
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={fetchInventory} className="btn btn-outline btn-sm">
            <RefreshCw size={14} />
            <span>Refresh</span>
          </button>
          <Link to="/admin/orders" className="btn btn-primary btn-sm">
            <ShoppingCart size={14} />
            <span>Manage Live Orders</span>
          </Link>
        </div>
      </div>

      {/* Metrics Top Bar */}
      <div className="admin-metrics">
        <div className="metric-card">
          <div className="metric-icon red">
            <Package size={24} />
          </div>
          <div className="metric-data">
            <h4>Total Ingredients</h4>
            <p>{items.length}</p>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon orange">
            <AlertTriangle size={24} />
          </div>
          <div className="metric-data">
            <h4>Low-Stock Alerts</h4>
            <p style={{ color: lowStockCount > 0 ? 'var(--color-danger)' : 'inherit' }}>
              {lowStockCount} items
            </p>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon green">
            <Layers size={24} />
          </div>
          <div className="metric-data">
            <h4>Total Stock Units</h4>
            <p>{totalStockUnits}</p>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {['all', 'base', 'sauce', 'cheese', 'veggie'].map((cat) => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={`btn btn-sm ${categoryFilter === cat ? 'btn-primary' : 'btn-outline'}`}
            style={{ textTransform: 'capitalize' }}
          >
            {cat === 'all' ? 'All Ingredients' : `${cat}s`}
          </button>
        ))}
      </div>

      {/* Inventory Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <Loader2 size={36} className="animate-spin" color="var(--color-primary)" style={{ margin: '0 auto 12px' }} />
          <p style={{ color: 'var(--color-text-muted)' }}>Retrieving live inventory telemetry...</p>
        </div>
      ) : (
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Ingredient Name</th>
                <th>Category</th>
                <th>Unit Price</th>
                <th>Stock Level</th>
                <th>Alert Threshold</th>
                <th>Operational Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => {
                const threshold = item.threshold || 20;
                const isOutOfStock = item.stock <= 0;
                const isLowStock = item.stock < threshold;

                return (
                  <tr key={item._id}>
                    <td style={{ fontWeight: '700' }}>{item.name}</td>
                    <td style={{ textTransform: 'capitalize', color: 'var(--color-text-muted)' }}>
                      {item.category}
                    </td>
                    <td style={{ fontWeight: '700' }}>₹{item.price}</td>
                    <td style={{ fontWeight: '800', fontSize: '16px' }}>
                      <span style={{ color: isOutOfStock ? 'var(--color-danger)' : isLowStock ? 'var(--color-warning)' : 'inherit' }}>
                        {item.stock} units
                      </span>
                    </td>
                    <td>{threshold} units</td>
                    <td>
                      {isOutOfStock ? (
                        <span className="badge badge-danger">Out of Stock</span>
                      ) : isLowStock ? (
                        <span className="badge badge-warning">Low Stock ({item.stock}/{threshold})</span>
                      ) : (
                        <span className="badge badge-delivered">Adequate Supply</span>
                      )}
                    </td>
                    <td>
                      <button
                        onClick={() => setActiveItem(item)}
                        className="btn btn-outline btn-sm"
                      >
                        <Edit3 size={14} />
                        <span>Adjust Stock</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Manual Stock Adjust Modal */}
      {activeItem && (
        <ManualStockModal
          item={activeItem}
          onClose={() => setActiveItem(null)}
          onUpdated={(updated) => {
            setItems((prev) => prev.map((i) => (i._id === updated._id ? updated : i)));
          }}
        />
      )}
    </div>
  );
}

