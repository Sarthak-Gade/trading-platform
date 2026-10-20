import { NavLink } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { initials } from './format';
import Icon, { type IconName } from './Icon';

const items: { path: string; label: string; icon: IconName; admin?: boolean }[] = [
  { path: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { path: '/terminal', label: 'Terminal', icon: 'activity' },
  { path: '/portfolio', label: 'Portfolio', icon: 'briefcase' },
  { path: '/journal', label: 'Trading Journal', icon: 'book' },
  { path: '/wallet', label: 'Wallet & Ledger', icon: 'wallet' },
  { path: '/profile', label: 'Profile & KYC', icon: 'user' },
  { path: '/admin', label: 'Admin', icon: 'shield', admin: true },
];

function Sidebar() {
  const { user, isAdmin } = useAuth();
  const name = user?.fullName ?? 'Trader';

  return (
    <aside className="sidebar">
      <div>
        <span className="sidebar-label">Menu</span>
        <nav className="nav">
          {items
            .filter((item) => !item.admin || isAdmin)
            .map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
              >
                <Icon name={item.icon} size={18} />
                {item.label}
              </NavLink>
            ))}
        </nav>
      </div>

      <div>
        <div className="sidebar-tip">
          Press <kbd>Ctrl</kbd> + <kbd>K</kbd> on the dashboard to search any stock instantly.
        </div>
        <div className="sidebar-foot">
          <span className="avatar">{initials(name)}</span>
          <div>
            <strong>{name}</strong>
            <small className="muted">{isAdmin ? 'Administrator' : 'Paper trading'}</small>
          </div>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;