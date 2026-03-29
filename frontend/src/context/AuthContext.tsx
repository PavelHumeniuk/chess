/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';

const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '/api';

async function parseApiResponse<T>(res: Response): Promise<T> {
  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const body = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    if (isJson && typeof body === 'object' && body && 'error' in body) {
      throw new Error(String((body as { error?: string }).error || 'Request failed'));
    }
    throw new Error(`Request failed (${res.status}). Check API routing for ${API_BASE}.`);
  }

  if (!isJson) {
    throw new Error('API returned non-JSON response. Check reverse proxy /api routing.');
  }

  return body as T;
}

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  avatar?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (credential: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // On mount, restore session from auth cookie.
  useEffect(() => {
    fetch(`${API_BASE}/auth/me`, {
      credentials: 'include',
    })
      .then(r => parseApiResponse<{ user: AuthUser }>(r))
      .then(({ user }) => setUser(user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (credential: string) => {
    const res = await fetch(`${API_BASE}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ credential }),
    });
    const { user } = await parseApiResponse<{ user: AuthUser }>(res);
    setUser(user);
  }, []);

  const logout = useCallback(() => {
    fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {
      // Local state still resets even if request fails.
    });
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
