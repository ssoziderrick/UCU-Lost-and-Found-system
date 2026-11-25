import { createContext, startTransition, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  // On load, ask the server who we are (the httpOnly cookie is sent automatically).
  useEffect(() => {
    api.get('/api/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const d = await api.post('/api/auth/login', { email, password });
    setUser(d.user);
    return d;
  }, []);

  const register = useCallback(async (form) => {
    const d = await api.post('/api/auth/register', form);
    setUser(d.user);
    return d;
  }, []);

  /**
   * Ends the session. `then` (e.g. a navigate call) runs in the same transition as clearing the user,
   * so protected pages never render signed-out and redirect to the login page on the way out.
   */
  const logout = useCallback(async (then) => {
    try { await api.post('/api/auth/logout'); } finally {
      startTransition(() => { setUser(null); then?.(); });
    }
  }, []);

  const value = useMemo(() => ({ user, checking, login, register, logout, isAdmin: user?.role === 'admin' }),
    [user, checking, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
