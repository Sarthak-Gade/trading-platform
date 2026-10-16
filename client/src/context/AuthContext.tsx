import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export interface AuthUser {
  role: 'USER' | 'ADMIN';
  fullName: string;
  email: string;
}

interface StoredProfile {
  fullName?: string;
  email?: string;
}

interface AuthContextType {
  token: string | null;
  user: AuthUser | null;
  isAdmin: boolean;
  login: (token: string, profile?: StoredProfile) => void;
  logout: () => void;
}

const TOKEN_KEY = 'token';
const PROFILE_KEY = 'profile';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Reads the (unsigned) payload of a JWT. The server still checks the signature on every request;
// this is only used to show or hide parts of the interface.
function decodeToken(token: string): { role?: string; exp?: number } | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

function isExpired(token: string): boolean {
  const payload = decodeToken(token);
  return !!payload?.exp && payload.exp * 1000 < Date.now();
}

function readToken(): string | null {
  try {
    const stored = localStorage.getItem(TOKEN_KEY);
    return stored && !isExpired(stored) ? stored : null;
  } catch {
    return null;
  }
}

function readProfile(): StoredProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as StoredProfile) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(readToken);
  const [profile, setProfile] = useState<StoredProfile | null>(readProfile);

  const login = useCallback((newToken: string, newProfile?: StoredProfile) => {
    try {
      localStorage.setItem(TOKEN_KEY, newToken);
      if (newProfile) localStorage.setItem(PROFILE_KEY, JSON.stringify(newProfile));
    } catch {
      // storage can be blocked; the session still works until the tab closes
    }
    setToken(newToken);
    if (newProfile) setProfile(newProfile);
  }, []);

  const logout = useCallback(() => {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(PROFILE_KEY);
    } catch {
      // ignore
    }
    setToken(null);
    setProfile(null);
  }, []);

  // api.ts fires this when the server rejects the token (expired or invalid)
  useEffect(() => {
    window.addEventListener('auth:expired', logout);
    return () => window.removeEventListener('auth:expired', logout);
  }, [logout]);

  const user = useMemo<AuthUser | null>(() => {
    if (!token) return null;
    const payload = decodeToken(token);
    return {
      role: payload?.role === 'ADMIN' ? 'ADMIN' : 'USER',
      fullName: profile?.fullName || 'Trader',
      email: profile?.email || '',
    };
  }, [token, profile]);

  const value = useMemo<AuthContextType>(
    () => ({ token, user, isAdmin: user?.role === 'ADMIN', login, logout }),
    [token, user, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
