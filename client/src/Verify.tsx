import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { apiFetch } from './api';
import AuthHero from './AuthHero';
import Icon, { type IconName } from './Icon';

interface VerifyState {
  email?: string;
  maskedMobile?: string;
  emailVerified?: boolean;
  mobileVerified?: boolean;
  delivery?: { email?: string; mobile?: string };
  devCodes?: { email?: string; mobile?: string };
}

const RESEND_SECONDS = 60;

interface BoxProps {
  title: string;
  hint: string;
  icon: IconName;
  verified: boolean;
  devCode?: string;
  sendFailed: boolean;
  canResend: boolean;
  onVerify: (code: string) => Promise<void>;
  // Returns the new dev code when the server is in development mode
  onResend: () => Promise<string | undefined>;
}

// One code box: used once for the email code and once for the mobile code
function CodeBox({ title, hint, icon, verified, devCode, sendFailed, canResend, onVerify, onResend }: BoxProps) {
  const [code, setCode] = useState('');
  const [dev, setDev] = useState(devCode ?? '');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [resendAt, setResendAt] = useState(() => Date.now() + RESEND_SECONDS * 1000);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const wait = Math.max(0, Math.ceil((resendAt - now) / 1000));

  if (verified) {
    return (
      <div className="notice notice-success">
        <Icon name="check-circle" size={16} /> {title} verified
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setBusy(true);
    try {
      await onVerify(code);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not verify the code');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError('');
    setInfo('');
    try {
      const newDev = await onResend();
      setDev(newDev ?? '');
      setCode('');
      setInfo('A new code has been sent.');
      setResendAt(Date.now() + RESEND_SECONDS * 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send a new code');
    }
  };

  return (
    <form className="stack" onSubmit={submit} style={{ paddingBottom: 6 }}>
      <div className="row">
        <span className="stat-icon blue" style={{ width: 34, height: 34 }}>
          <Icon name={icon} size={16} />
        </span>
        <div>
          <div className="strong">{title}</div>
          <div className="muted" style={{ fontSize: 12 }}>{hint}</div>
        </div>
      </div>

      {sendFailed && (
        <div className="notice notice-warn">
          <Icon name="alert-circle" size={16} /> We could not send this code. Press Resend to try again.
        </div>
      )}

      {dev && (
        <div className="notice notice-info">
          <Icon name="zap" size={16} />
          <span>
            Development mode: code is <strong>{dev}</strong>{' '}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCode(dev)}>
              Fill it in
            </button>
          </span>
        </div>
      )}

      <div className="row">
        <input
          className="input"
          style={{ letterSpacing: '0.4em', textAlign: 'center', fontSize: 18, fontWeight: 700 }}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="••••••"
          aria-label={`${title} code`}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        />
        <button type="submit" className="btn btn-primary" disabled={busy || code.length !== 6}>
          {busy ? '…' : 'Verify'}
        </button>
      </div>

      {error && (
        <div className="notice notice-error" role="alert">
          <Icon name="alert-circle" size={16} /> {error}
        </div>
      )}
      {info && (
        <div className="notice notice-success" role="status">
          <Icon name="check-circle" size={16} /> {info}
        </div>
      )}

      <div className="muted" style={{ fontSize: 13 }}>
        {wait > 0 ? (
          <>Resend in {wait}s</>
        ) : (
          <button type="button" className="btn btn-ghost btn-sm" onClick={resend} disabled={!canResend}>
            Resend code
          </button>
        )}
      </div>
    </form>
  );
}

function Verify() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = (location.state ?? {}) as VerifyState;

  const [email, setEmail] = useState(state.email ?? '');
  const [done, setDone] = useState({ email: !!state.emailVerified, mobile: !!state.mobileVerified });

  const finish = (next: { email: boolean; mobile: boolean }) => {
    setDone(next);
    if (next.email && next.mobile) {
      navigate('/login', { state: { email, notice: 'Email and mobile verified. You can log in now.' } });
    }
  };

  const verify = (channel: 'email' | 'mobile') => async (code: string) => {
    const data = await apiFetch(`/api/auth/verify-${channel === 'email' ? 'email' : 'mobile'}`, null, {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    });
    finish({ email: !!data.emailVerified, mobile: !!data.mobileVerified });
  };

  const resend = (channel: 'email' | 'mobile') => async () => {
    const data = await apiFetch('/api/auth/resend-code', null, {
      method: 'POST',
      body: JSON.stringify({ email, channel }),
    });
    const code = data?.devCodes?.[channel];
    return typeof code === 'string' ? code : undefined;
  };

  return (
    <div className="auth-shell">
      <AuthHero />
      <div className="auth-panel">
        <div className="auth-card">
          <h2>Verify your account</h2>
          <p className="sub">
            Enter the two 6-digit codes we sent. Each is valid for 10 minutes.
          </p>

          {!state.email && (
            <div className="field" style={{ marginBottom: 14 }}>
              <label className="label" htmlFor="email">Email</label>
              <div className="input-icon">
                <Icon name="mail" size={16} className="lead" />
                <input
                  id="email"
                  className="input"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>
          )}

          <div className="stack" style={{ gap: 18 }}>
            <CodeBox
              title="Email code"
              hint={state.email ? `Sent to ${state.email}` : 'Sent to your email'}
              icon="mail"
              verified={done.email}
              devCode={state.devCodes?.email}
              sendFailed={state.delivery?.email === 'failed'}
              canResend={!!email}
              onVerify={verify('email')}
              onResend={resend('email')}
            />
            <CodeBox
              title="Mobile code"
              hint={state.maskedMobile ? `SMS sent to ${state.maskedMobile}` : 'Sent by SMS to your mobile'}
              icon="phone"
              verified={done.mobile}
              devCode={state.devCodes?.mobile}
              sendFailed={state.delivery?.mobile === 'failed'}
              canResend={!!email}
              onVerify={verify('mobile')}
              onResend={resend('mobile')}
            />
          </div>

          <p className="auth-foot">
            <Link to="/login">Back to log in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Verify;