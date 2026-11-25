// Route guards: improve UX by redirecting early. Real enforcement happens on the server.
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { Loading } from './ui';

export function RequireAuth({ children }) {
  const { user, checking } = useAuth();
  const location = useLocation();
  if (checking) return <Loading label="Checking your session…" />;
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search, flash: 'Please sign in to continue.' }} />;
  }
  return children;
}

/** Student-only pages (the dashboard). Administrators are sent to their console. */
export function RequireStudent({ children }) {
  const { user, checking, isAdmin } = useAuth();
  const location = useLocation();
  if (checking) return <Loading label="Checking your session…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname, flash: 'Please sign in to continue.' }} />;
  if (isAdmin) return <Navigate to="/admin" replace />;
  return children;
}

/** Sign-in and activation pages: someone already signed in goes to their home instead. */
export function GuestOnly({ children }) {
  const { user, checking, isAdmin } = useAuth();
  if (checking) return <Loading label="Checking your session…" />;
  if (user) return <Navigate to={isAdmin ? '/admin' : '/dashboard'} replace />;
  return children;
}

/** Admin pages that need a specific permission. The API enforces the same rule. */
export function RequirePermission({ permission, children }) {
  const { can } = useAuth();
  if (!can(permission)) {
    return (
      <div className="flex flex-col gap-2 rounded-card border border-line bg-white p-6">
        <h1 className="text-xl font-bold">This page isn’t available for your role</h1>
        <p className="text-muted">Ask a super admin if you need access.</p>
      </div>
    );
  }
  return children;
}

export function RequireAdmin({ children }) {
  const { user, checking, isAdmin } = useAuth();
  if (checking) return <Loading label="Checking your session…" />;
  if (!user) return <Navigate to="/login?as=staff" replace state={{ from: '/admin', flash: 'Please sign in with your staff ID.' }} />;
  if (!isAdmin) return <Navigate to="/dashboard" replace state={{ flash: 'That page is only for administrators.' }} />;
  return children;
}
