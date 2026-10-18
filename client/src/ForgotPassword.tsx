import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from './api';
import AuthHero from './AuthHero';
import Icon from './Icon';

function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'email' | 'reset'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [show, setShow] = useState(false);
  const [devCode, setDevCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const data = await apiFetch('/api/auth/forgot-password', null, {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setDevCode(typeof data.devCode === 'string' ? data.devCode : '');
      setStep('reset');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the code');
    } finally {
      setBusy(false);
    }
  };

  const reset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await apiFetch('/api/auth/reset-password', null, {
        method: 'POST',
        body: JSON.stringify({ email, code, newPassword }),
      });
      navigate('/login', { state: { email, notice: 'Password updated. You can log in now.' } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset the password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-shell">
      <AuthHero />
      <div className="auth-panel">
        <div className="auth-card">
          {step === 'email' ? (
            <>
              <h2>Forgot your password?</h2>
              <p className="sub">Enter your email and we will send you a 6-digit code.</p>
              <form className="stack" onSubmit={requestCode}>
                <div className="field">
                  <label className="label" htmlFor="email">Email</label>
                  <div className="input-icon">
                    <Icon name="mail" size={16} className="lead" />
                    <input
                      id="email"
                      className="input"
                      type="email"
                      autoComplete="email"
                      autoFocus
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>
                {error && (
                  <div className="notice notice-error" role="alert">
                    <Icon name="alert-circle" size={16} /> {error}
                  </div>
                )}
                <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
                  {busy ? 'Sending…' : 'Send code'}
                </button>
              </form>
            </>
          ) : (
            <>
              <h2>Choose a new password</h2>
              <p className="sub">
                If an account exists for <strong>{email}</strong>, we sent it a code. It is valid for 10 minutes.
              </p>

              {devCode && (
                <div className="notice notice-info" style={{ marginBottom: 14 }}>
                  <Icon name="zap" size={16} />
                  <span>
                    Development mode: your code is <strong>{devCode}</strong>{' '}
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCode(devCode)}>
                      Fill it in
                    </button>
                  </span>
                </div>
              )}

              <form className="stack" onSubmit={reset}>
                <div className="field">
                  <label className="label" htmlFor="code">Reset code</label>
                  <input
                    id="code"
                    className="input"
                    style={{ letterSpacing: '0.5em', textAlign: 'center', fontSize: 20, fontWeight: 700 }}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    maxLength={6}
                    placeholder="••••••"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    required
                  />
                </div>

                <div className="field">
                  <label className="label" htmlFor="newPassword">New password</label>
                  <div className="input-icon has-trail">
                    <Icon name="lock" size={16} className="lead" />
                    <input
                      id="newPassword"
                      className="input"
                      type={show ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="8+ characters with a letter and a number"
                      minLength={8}
                      maxLength={72}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
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

                <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy || code.length !== 6}>
                  {busy ? 'Updating…' : 'Update password'}
                </button>
              </form>
              <p className="auth-foot">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setStep('email'); setError(''); }}>
                  Use a different email
                </button>
              </p>
            </>
          )}

          <p className="auth-foot">
            <Link to="/login">Back to log in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default ForgotPassword;