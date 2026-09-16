import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';

function Navbar() {
  const { token, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '1rem 1.5rem',
        background: '#1a1d29',
        borderBottom: '1px solid #2a2f42',
      }}
    >
      <Link to="/dashboard" style={{ color: '#e4e6eb', fontWeight: 700, fontSize: '1.1rem', textDecoration: 'none' }}>
        TradeSim
      </Link>
      {token && (
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <Link to="/dashboard" style={{ color: '#9098ac', textDecoration: 'none' }}>Dashboard</Link>
          <Link to="/admin" style={{ color: '#9098ac', textDecoration: 'none' }}>Admin</Link>
          <button onClick={handleLogout}>Log Out</button>
        </div>
      )}
    </nav>
  );
}

export default Navbar;