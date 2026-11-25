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

  /**
   * kind "student": { registrationNumber, password, remember }; kind "admin": { staffId, password }.
   * `then(response)` (e.g. navigate with a welcome message) runs in the same transition as setting the user,
   * so guest-only pages don't redirect first and drop the message.
   */
  const login = useCallback(async (kind, body, then) => {
    const d = await api.post(kind === 'admin' ? '/api/auth/admin/login' : '/api/auth/login', body);
    startTransition(() => { setUser(d.user); then?.(d); });
    return d;
  }, []);

  /** For flows that sign the user in themselves (account activation). Same `then` rule as login. */
  const signedIn = useCallback((u, then) => startTransition(() => { setUser(u); then?.(); }), []);

  /**
   * Ends the session. `then` (e.g. a navigate call) runs in the same transition as clearing the user,
   * so protected pages never render signed-out and redirect to the login page on the way out.
   */
  const logout = useCallback(async (then) => {
    try { await api.post('/api/auth/logout'); } finally {
      startTransition(() => { setUser(null); then?.(); });
    }
  }, []);

  const can = useCallback((permission) => Boolean(user?.permissions?.includes(permission)), [user]);

  const value = useMemo(() => ({
    user, checking, login, signedIn, logout, can, isAdmin: user?.role === 'admin',
  }), [user, checking, login, signedIn, logout, can]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
