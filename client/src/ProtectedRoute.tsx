import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './context/AuthContext';

// Everything inside needs a signed-in user
function ProtectedRoute() {
  const { token } = useAuth();
  return token ? <Outlet /> : <Navigate to="/login" replace />;
}

export default ProtectedRoute;
