import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: '📊' },
  { path: '/portfolio', label: 'My Portfolio', icon: '💼' },
  { path: '/wallet', label: 'Wallet & Ledger', icon: '🏦' },
  { path: '/admin', label: 'Admin', icon: '⚙️' },
];

function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside
      style={{
        width: '220px',
        minHeight: '100vh',
        background: '#1a1d29',
        borderRight: '1px solid #2a2f42',
        padding: '1.5rem 0',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <div>
        <div style={{ padding: '0 1.5rem', marginBottom: '2rem', fontWeight: 700, fontSize: '1.1rem' }}>
          TradeSim
        </div>
        <nav>
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.65rem 1.5rem',
                  color: isActive ? '#4f8cff' : '#9098ac',
                  background: isActive ? '#22263a' : 'transparent',
                  borderLeft: isActive ? '3px solid #4f8cff' : '3px solid transparent',
                  textDecoration: 'none',
                  fontSize: '0.9rem',
                }}
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div style={{ padding: '0 1.5rem', borderTop: '1px solid #2a2f42', paddingTop: '1rem' }}>
        <button
          onClick={handleLogout}
          style={{ width: '100%', background: '#2a2f42' }}
        >
          Log Out
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;