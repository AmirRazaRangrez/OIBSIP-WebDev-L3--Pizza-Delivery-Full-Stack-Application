// client/src/pages/ManualStockModal.jsx
import React, { useState } from 'react';
import { X, Save, AlertCircle } from 'lucide-react';
import api from '../services/api';

export default function ManualStockModal({ item, onClose, onUpdated }) {
  const [stock, setStock] = useState(item.stock);
  const [threshold, setThreshold] = useState(item.threshold || 20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const parsedStock = parseInt(stock, 10);
    const parsedThreshold = parseInt(threshold, 10);

    if (isNaN(parsedStock) || parsedStock < 0) {
      setError('Stock must be a non-negative integer.');
      return;
    }

    if (isNaN(parsedThreshold) || parsedThreshold < 0) {
      setError('Threshold must be a non-negative integer.');
      return;
    }

    setLoading(true);
    try {
      await api.updateInventoryStock(item._id, {
        stock: parsedStock,
        threshold: parsedThreshold
      });
      onUpdated({ ...item, stock: parsedStock, threshold: parsedThreshold });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to update stock levels.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Adjust Inventory: {item.name}</h3>
          <button onClick={onClose} className="close-btn">
            <X size={20} />
          </button>
        </div>

        {error && (
          <div style={{
            background: '#ffebee',
            color: '#c62828',
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            marginBottom: '16px',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Ingredient Category</label>
            <input
              type="text"
              className="form-control"
              value={item.category.toUpperCase()}
              disabled
              style={{ background: '#f8f8f8', cursor: 'not-allowed' }}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Current Stock Count (Units)</label>
            <input
              type="number"
              className="form-control"
              min="0"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Low-Stock Alert Threshold (Units)</label>
            <input
              type="number"
              className="form-control"
              min="0"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              required
            />
            <small style={{ color: 'var(--color-text-muted)', fontSize: '11px' }}>
              Automatic email alert will trigger if stock drops below this threshold.
            </small>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
            <button type="button" onClick={onClose} className="btn btn-outline">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              <Save size={16} />
              <span>{loading ? 'Saving...' : 'Update Stock'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

