import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserPlus, AlertCircle, CheckCircle, Mail, Sparkles, Loader2 } from 'lucide-react';
import api from '../services/api';
import { useSocket } from '../context/SocketContext';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [successData, setSuccessData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isVerifiedRealtime, setIsVerifiedRealtime] = useState(false);

  const navigate = useNavigate();
  const { socket } = useSocket();

  // Real-time listener: When email is verified from ANY source (mobile, other tab, external mail client),
  // this window automatically detects it via WebSockets and updates live!
  useEffect(() => {
    if (!socket || !email) return;

    const handleVerified = (data) => {
      if (data.email && data.email.toLowerCase() === email.trim().toLowerCase()) {
        setIsVerifiedRealtime(true);
        setTimeout(() => {
          navigate('/login', { state: { verifiedEmail: email.trim(), verifiedNotice: true } });
        }, 2200);
      }
    };

    socket.on('email_verified', handleVerified);
    return () => {
      socket.off('email_verified', handleVerified);
    };
  }, [socket, email, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.register({ name, email, password });
      setSuccessData(res);
    } catch (err) {
      setError(err.message || 'Registration failed. Email may already be in use.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email) return;
    setLoading(true);
    try {
      const res = await api.resendVerification(email);
      setSuccessData(res);
      setError('');
    } catch (err) {
      setError(err.message || 'Could not retrieve verification link.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div className="auth-header">
          <h1>Create an Account</h1>
          <p>Join Zomato Pizza for exclusive culinary customizers</p>
        </div>

        {error && (
          <div style={{
            background: '#ffebee',
            color: '#c62828',
            padding: '14px 16px',
            borderRadius: 'var(--radius-md)',
            marginBottom: '20px',
            fontSize: '13px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: error.includes('already exists') ? '10px' : '0' }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>

            {error.includes('already exists') && (
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <Link
                  to="/login"
                  className="btn btn-primary btn-sm"
                  style={{ flex: 1, textAlign: 'center', justifyContent: 'center' }}
                >
                  Sign In
                </Link>
                <button
                  type="button"
                  onClick={handleResend}
                  className="btn btn-outline btn-sm"
                  style={{ flex: 1, justifyContent: 'center', borderColor: '#c62828', color: '#c62828' }}
                >
                  Verify Email
                </button>
              </div>
            )}
          </div>
        )}

        {isVerifiedRealtime ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{
              width: '72px',
              height: '72px',
              borderRadius: '50%',
              background: '#edfaf1',
              color: 'var(--color-success)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              boxShadow: '0 4px 16px rgba(17, 166, 89, 0.2)'
            }}>
              <CheckCircle size={40} />
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '8px', color: 'var(--color-text)' }}>
              Email Verified in Real-Time! 🎉
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginBottom: '20px' }}>
              We detected your verification click. Redirecting you to Sign In in a moment...
            </p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '16px', color: 'var(--color-primary)' }}>
              <Loader2 size={16} className="animate-spin" />
              <span style={{ fontSize: '13px', fontWeight: '600' }}>Preparing your session...</span>
            </div>
            <Link to="/login" className="btn btn-primary" style={{ width: '100%' }}>
              Proceed to Sign In Now
            </Link>
          </div>
        ) : successData ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{
              width: '60px',
              height: '60px',
              borderRadius: '50%',
              background: '#edfaf1',
              color: 'var(--color-success)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px'
            }}>
              <CheckCircle size={32} />
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '8px' }}>
              Registration Successful!
            </h3>
            <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginBottom: '20px' }}>
              We've dispatched an email verification link to <strong>{email}</strong>.
            </p>

            <div style={{
              background: '#f8f9fa',
              border: '1px solid var(--color-border)',
              padding: '16px',
              borderRadius: 'var(--radius-md)',
              marginBottom: '20px',
              fontSize: '13px',
              textAlign: 'left'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: 'var(--color-primary)' }}>
                <Loader2 size={14} className="animate-spin" />
                <span style={{ fontWeight: '600' }}>Listening for live verification...</span>
              </div>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', lineHeight: '1.6', marginBottom: '14px' }}>
                Please open your email application, locate the verification message, and click the activation link. <strong>This screen will automatically refresh</strong> the moment you click it!
              </p>
              <button
                type="button"
                onClick={handleResend}
                disabled={loading}
                className="btn btn-outline btn-sm"
                style={{ width: '100%', justifyContent: 'center' }}
              >
                <Mail size={14} />
                <span>{loading ? 'Sending...' : 'Resend Email to Inbox'}</span>
              </button>

              {successData?.emailVerificationToken && (
                <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--color-border)', textAlign: 'center' }}>
                  <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '8px' }}>
                    Testing or Render free tier? Activate your account instantly:
                  </p>
                  <Link
                    to={`/verify-email?token=${successData.emailVerificationToken}`}
                    className="btn btn-primary btn-sm"
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    Activate Account Now (Instant) →
                  </Link>
                </div>
              )}
            </div>

            <Link to="/login" className="btn btn-primary" style={{ width: '100%' }}>
              Proceed to Sign In
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input
                type="text"
                className="form-control"
                placeholder="John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input
                type="email"
                className="form-control"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                className="form-control"
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '10px' }}
              disabled={loading}
            >
              <UserPlus size={16} />
              <span>{loading ? 'Registering...' : 'Create Account'}</span>
            </button>
          </form>
        )}

        <div className="auth-footer">
          Already registered? <Link to="/login">Sign in</Link>
        </div>
      </div>
    </div>
  );
}

