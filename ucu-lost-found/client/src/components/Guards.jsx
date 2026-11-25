// Route guards: improve UX by redirecting early. Real enforcement happens on the server.
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { Loading } from './ui';

export function RequireAuth({ children }) {
  const { user, checking } = useAuth();
  const location = useLocation();
  if (checking) return <Loading label="Checking your session…" />;
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search, flash: 'Please log in to continue.' }} />;
  }
  return children;
}

/** Student-only pages (the dashboard). Administrators are sent to their console. */
export function RequireStudent({ children }) {
  const { user, checking, isAdmin } = useAuth();
  const location = useLocation();
  if (checking) return <Loading label="Checking your session…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname, flash: 'Please log in to continue.' }} />;
  if (isAdmin) return <Navigate to="/admin" replace />;
  return children;
}

export function RequireAdmin({ children }) {
  const { user, checking, isAdmin } = useAuth();
  if (checking) return <Loading label="Checking your session…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: '/admin', flash: 'Please log in as the administrator.' }} />;
  if (!isAdmin) return <Navigate to="/dashboard" replace state={{ flash: 'That page is only for administrators.' }} />;
  return children;
}
