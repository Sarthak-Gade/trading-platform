import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { apiFetch } from './api';
import AuthHero from './AuthHero';
import Icon from './Icon';

function Signup() {
  const { token} = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [mobNumber, setMobNumber] = useState('');
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
      const data = await apiFetch('/api/auth/signup', null, {
        method: 'POST',
        body: JSON.stringify({ email, password, fullName, mobNumber }),
      });
      // The account must confirm its email and mobile number before it can log in
      navigate('/verify', { state: { ...data, email } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-shell">
      <AuthHero />
      <div className="auth-panel">
        <div className="auth-card">
          <h2>Create your account</h2>
          <p className="sub">Start with virtual money. No card needed.</p>

          <form className="stack" onSubmit={handleSubmit}>
            <div className="field">
              <label className="label" htmlFor="fullName">Full name</label>
              <div className="input-icon">
                <Icon name="user" size={16} className="lead" />
                <input
                  id="fullName"
                  className="input"
                  autoComplete="name"
                  placeholder="Your name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
            </div>

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
              <label className="label" htmlFor="mob">Mobile number</label>
              <div className="input-icon">
                <Icon name="phone" size={16} className="lead" />
                <input
                  id="mob"
                  className="input"
                  type="tel"
                  autoComplete="tel"
                  placeholder="10-digit mobile number"
                  maxLength={15}
                  value={mobNumber}
                  onChange={(e) => setMobNumber(e.target.value)}
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
                  autoComplete="new-password"
                  placeholder="8+ characters with a letter and a number"
                  minLength={8}
                  maxLength={72}
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

            {error && (
              <div className="notice notice-error" role="alert">
                <Icon name="alert-circle" size={16} /> {error}
              </div>
            )}

            <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
              {busy ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <p className="auth-foot">
            Already registered? <Link to="/login">Log in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Signup;
