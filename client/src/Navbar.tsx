import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useBalance } from './context/BalanceContext';
import { getMarketPhase, inr, initials } from './format';

const PHASE_VIEW = {
  OPEN: { dot: 'open', label: 'Open' },
  PRE_OPEN: { dot: 'pre', label: 'Pre-open' },
  CLOSED: { dot: 'closed', label: 'Closed' },
} as const;
import Icon from './Icon';

function Navbar() {
  const { user, isAdmin, logout } = useAuth();
  const { balance } = useBalance();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState(getMarketPhase);
  const view = PHASE_VIEW[phase];
  const menuRef = useRef<HTMLDivElement>(null);

  // Keep the market status pill current without a page reload
  useEffect(() => {
    const timer = setInterval(() => setPhase(getMarketPhase()), 30000);
    return () => clearInterval(timer);
  }, []);

  // Close the profile menu on outside click or Escape
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  const handleLogout = () => {
    setOpen(false);
    logout();
    navigate('/login');
  };

  const name = user?.fullName ?? 'Trader';

  return (
    <header className="topbar">
      <Link to="/dashboard" className="brand">
        <span className="brand-badge">TS</span>
        <span className="brand-word">
          Trade<span>Sim</span>
        </span>
      </Link>

      <div className="topbar-mid">
        <span className="pill" title="NSE equity market hours, 9:15 to 15:30 IST, Monday to Friday">
          <span className={`dot ${view.dot}`} />
          <span className="pill-market-label">Market</span>
          <b>{view.label}</b>
        </span>
      </div>

      <div className="topbar-end">
        <Link to="/wallet" className="pill" title="Open wallet">
          <Icon name="wallet" size={14} />
          <span className="pill-market-label">Balance</span>
          <b>{balance ? inr(Number(balance.availableBalance)) : '—'}</b>
        </Link>

        <div className="menu-wrap" ref={menuRef}>
          <button
            type="button"
            className="profile-btn"
            aria-expanded={open}
            aria-haspopup="menu"
            onClick={() => setOpen((v) => !v)}
          >
            <span className="avatar">{initials(name)}</span>
            <span className="profile-text">
              <strong>{name}</strong>
              <small>{isAdmin ? 'Administrator' : 'Trader'}</small>
            </span>
            <Icon name="chevron-down" size={14} />
          </button>

          {open && (
            <div className="menu" role="menu">
              <div className="menu-head">
                <strong>{name}</strong>
                <small>{user?.email || 'Signed in'}</small>
              </div>
              <button type="button" className="menu-item" role="menuitem" onClick={() => go('/profile')}>
                <Icon name="user" size={16} /> Profile &amp; KYC
              </button>
              <button type="button" className="menu-item" role="menuitem" onClick={() => go('/wallet')}>
                <Icon name="wallet" size={16} /> Wallet
              </button>
              {isAdmin && (
                <button type="button" className="menu-item" role="menuitem" onClick={() => go('/admin')}>
                  <Icon name="shield" size={16} /> Admin
                </button>
              )}
              <button type="button" className="menu-item danger" role="menuitem" onClick={handleLogout}>
                <Icon name="log-out" size={16} /> Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default Navbar;
