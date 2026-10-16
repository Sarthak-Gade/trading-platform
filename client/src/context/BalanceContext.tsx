import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { apiFetch } from '../api';

interface Balance {
  availableBalance: string;
  usedMargin: string;
}

interface BalanceContextType {
  balance: Balance | null;
  // Reload now, e.g. right after placing an order or moving money
  refresh: () => void;
}

const REFRESH_MS = 10000;

const BalanceContext = createContext<BalanceContextType | undefined>(undefined);

// One shared balance for the whole app, so the top bar, dashboard and wallet always agree
export function BalanceProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [loaded, setLoaded] = useState<Balance | null>(null);

  const refresh = useCallback(() => {
    if (!token) return;
    apiFetch('/api/me/balance', token)
      .then((data: Balance) => setLoaded(data))
      .catch(() => undefined);
  }, [token]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const balance = token ? loaded : null;
  const value = useMemo(() => ({ balance, refresh }), [balance, refresh]);

  return <BalanceContext.Provider value={value}>{children}</BalanceContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useBalance() {
  const context = useContext(BalanceContext);
  if (!context) {
    throw new Error('useBalance must be used within BalanceProvider');
  }
  return context;
}
