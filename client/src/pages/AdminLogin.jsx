// client/src/pages/AdminLogin.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, AlertCircle, LogIn, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function AdminLogin() {
  const [email, setEmail] = useState('admin@pizzadelivery.com');
  const [password, setPassword] = useState('AdminPassword123!');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { adminLogin } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await adminLogin({ email, password });
      navigate('/admin/inventory');
    } catch (err) {
      setError(err.message || 'Access denied. Valid administrator credentials required.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper" style={{ background: '#f0f2f5' }}>
      <div className="auth-card" style={{ borderTop: '4px solid var(--color-primary)' }}>
        <div className="auth-header">
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-primary-light)',
            color: 'var(--color-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px'
          }}>
            <ShieldCheck size={32} />
          </div>
          <h1>Zomato Kitchen Admin</h1>
          <p>Restricted access portal for inventory control & order dispatch</p>
        </div>

        {error && (
          <div style={{
            background: '#ffebee',
            color: '#c62828',
            padding: '12px 16px',
            borderRadius: 'var(--radius-md)',
            marginBottom: '20px',
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
            <label className="form-label">Admin Email</label>
            <input
              type="email"
              className="form-control"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Admin Password</label>
            <input
              type="password"
              className="form-control"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '12px' }}
            disabled={loading}
          >
            <LogIn size={16} />
            <span>{loading ? 'Authenticating...' : 'Enter Admin Console'}</span>
          </button>
        </form>

        <div style={{
          marginTop: '24px',
          padding: '12px',
          background: '#fff8eb',
          borderRadius: 'var(--radius-md)',
          border: '1px solid #ffe6b6',
          fontSize: '12px',
          color: '#8a5300',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <Lock size={16} />
          <span>Default seeded admin credentials are pre-filled for instant verification.</span>
        </div>
      </div>
    </div>
  );
}

