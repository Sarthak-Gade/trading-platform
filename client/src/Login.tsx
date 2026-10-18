import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { ApiError, apiFetch } from './api';
import AuthHero from './AuthHero';
import Icon from './Icon';

function Login() {
  const { token, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Set by the verify and reset-password pages after they succeed
  const arrived = (location.state ?? {}) as { email?: string; notice?: string };
  const [email, setEmail] = useState(arrived.email ?? '');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (token) return <Navigate to="/dashboard" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const data = await apiFetch('/api/auth/login', null, {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      login(data.token, { fullName: data.user?.fullName, email: data.user?.email ?? email });
      navigate('/dashboard');
    } catch (err) {
      // The account exists but its email or mobile was never confirmed: continue on the verify page
      if (err instanceof ApiError && err.data.code === 'NOT_VERIFIED') {
        navigate('/verify', {
          state: { ...err.data, email: typeof err.data.email === 'string' ? err.data.email : email },
        });
        return;
      }
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-shell">
      <AuthHero />
      <div className="auth-panel">
        <div className="auth-card">
          <h2>Welcome back</h2>
          <p className="sub">Log in to continue trading.</p>

          {arrived.notice && (
            <div className="notice notice-success" role="status" style={{ marginBottom: 14 }}>
              <Icon name="check-circle" size={16} /> {arrived.notice}
            </div>
          )}

          <form className="stack" onSubmit={handleSubmit}>
            <div className="field">
              <label className="label" htmlFor="email">Email</label>
              <div className="input-icon">
                <Icon name="mail" size={16} className="lead" />
                <input
                  id="email"
                  className="input"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="field">
              <label className="label" htmlFor="password">Password</label>
              <div className="input-icon has-trail">
                <Icon name="lock" size={16} className="lead" />
                <input
                  id="password"
                  className="input"
                  type={show ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="icon-btn trail"
                  aria-label={show ? 'Hide password' : 'Show password'}
                  onClick={() => setShow((v) => !v)}
                >
                  <Icon name={show ? 'eye-off' : 'eye'} size={16} />
                </button>
              </div>
            </div>

            <div style={{ textAlign: 'right', marginTop: -6 }}>
              <Link to="/forgot-password" style={{ fontSize: 13, fontWeight: 600 }}>Forgot password?</Link>
            </div>

            {error && (
              <div className="notice notice-error" role="alert">
                <Icon name="alert-circle" size={16} /> {error}
              </div>
            )}

            <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
              {busy ? 'Logging in…' : 'Log in'}
            </button>
          </form>

          <p className="auth-foot">
            New to TradeSim? <Link to="/signup">Create an account</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Login;