import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import api from '../services/api';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState('verifying'); // 'verifying' | 'success' | 'error'
  const [message, setMessage] = useState('');
  const hasRequested = useRef(false);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Missing verification token in link.');
      return;
    }

    if (hasRequested.current) return;
    hasRequested.current = true;

    api.verifyEmail(token)
      .then((res) => {
        setStatus('success');
        setMessage(res.message || 'Email successfully verified!');
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err.message || 'Invalid or expired verification token.');
      });
  }, [token]);

  return (
    <div className="auth-wrapper">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        {status === 'verifying' && (
          <div>
            <Loader2 size={48} className="animate-spin" color="var(--color-primary)" style={{ margin: '0 auto 16px' }} />
            <h2 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '8px' }}>Verifying Email...</h2>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>Please wait while we validate your credentials.</p>
          </div>
        )}

        {status === 'success' && (
          <div>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: '#edfaf1',
              color: 'var(--color-success)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px'
            }}>
              <CheckCircle2 size={36} />
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '8px' }}>Email Verified!</h2>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '14px', marginBottom: '24px' }}>{message}</p>
            <Link to="/login" className="btn btn-primary" style={{ width: '100%' }}>
              Log in to your account
            </Link>
          </div>
        )}

        {status === 'error' && (
          <div>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: '#fef0f1',
              color: 'var(--color-danger)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px'
            }}>
              <XCircle size={36} />
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '8px' }}>Verification Failed</h2>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '14px', marginBottom: '24px' }}>{message}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <Link to="/login" className="btn btn-primary" style={{ width: '100%' }}>
                Proceed to Sign In
              </Link>
              <Link to="/register" className="btn btn-outline" style={{ width: '100%' }}>
                Back to Registration
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

