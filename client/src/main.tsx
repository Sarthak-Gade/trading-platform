import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { BalanceProvider } from './context/BalanceContext';
import Layout from './Layout';
import ProtectedRoute from './ProtectedRoute';
import AdminRoute from './AdminRoute';
import Login from './Login';
import Signup from './Signup';
import Verify from './Verify';
import ForgotPassword from './ForgotPassword';
import Dashboard from './Dashboard';
import Terminal from './Terminal';
import Portfolio from './Portfolio';
import WalletPage from './WalletPage';
import ProfilePage from './ProfilePage';
import Admin from './Admin';
import './index.css';
import Journal from './Journal';
import Ipo from './Ipo';
import KycReview from './KycReview';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <BalanceProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/verify" element={<Verify />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />

            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/terminal" element={<Terminal />} />
                <Route path="/portfolio" element={<Portfolio />} />
                <Route path="/wallet" element={<WalletPage />} />
                <Route path="/journal" element={<Journal />} />
                <Route path="/ipo" element={<Ipo />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route element={<AdminRoute />}>
                <Route path="/admin" element={<Admin />} />
                <Route path="/admin/kyc" element={<KycReview />} />
                </Route>
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </BalanceProvider>
    </AuthProvider>
  </StrictMode>
);
