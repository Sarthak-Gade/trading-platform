import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './context/AuthContext';

// Admin-only pages. The server still enforces this; this just avoids showing a broken page.
function AdminRoute() {
  const { isAdmin } = useAuth();
  return isAdmin ? <Outlet /> : <Navigate to="/dashboard" replace />;
}

export default AdminRoute;
