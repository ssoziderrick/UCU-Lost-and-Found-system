import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { SearchX } from 'lucide-react';
import AppShell from './layouts/AppShell';
import AdminLayout from './layouts/AdminLayout';
import { GuestOnly, RequireAdmin, RequireAuth, RequirePermission, RequireStudent } from './components/Guards';
import { Loading, usePageTitle } from './components/ui';
import { useAuth } from './AuthContext';
import { Button, EmptyState } from './design/primitives';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import Browse from './pages/Browse';
import ReportDetail from './pages/ReportDetail';
import ReportForm from './pages/ReportForm';
import Login from './features/auth/Login';
import Activate from './features/auth/Activate';
import Recover from './features/auth/Recover';
import Students from './features/admin/Students';
import Registry from './features/admin/Registry';
import Admins from './features/admin/Admins';
import AuditLog from './features/admin/AuditLog';
import { ClaimDetail, MyClaims, MyReports } from './pages/Mine';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminClaim from './pages/admin/AdminClaim';

/** Content frame for pages that still use the v1 stylesheet; removed as each page is rebuilt. */
function LegacyFrame() {
  return <div className="legacy-page mx-auto max-w-6xl px-4 py-6 sm:px-6 md:py-8"><Outlet /></div>;
}

/** Same idea inside the admin console, for the two admin pages not yet rebuilt. */
const LegacyAdmin = ({ children }) => <div className="legacy-page">{children}</div>;

/** Visitors see the landing page; signed-in users go straight to their home. */
function Home() {
  const { user, checking, isAdmin } = useAuth();
  if (checking) return <Loading label="Checking your session…" />;
  if (user) return <Navigate to={isAdmin ? '/admin' : '/dashboard'} replace />;
  return <Landing />;
}

function NotFound() {
  usePageTitle('Page not found');
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <EmptyState icon={SearchX} title="Page not found" action={<Button to="/">Go to the home page</Button>}>
        The page you asked for doesn’t exist, or it has moved.
      </EmptyState>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Home />} />
        <Route path="dashboard" element={<RequireStudent><Dashboard /></RequireStudent>} />
        <Route path="login" element={<GuestOnly><Login /></GuestOnly>} />
        <Route path="activate" element={<GuestOnly><Activate /></GuestOnly>} />
        <Route path="register" element={<Navigate to="/activate" replace />} />
        <Route path="forgot-password" element={<Recover />} />
        <Route path="reset-password" element={<Recover />} />
        <Route path="set-password" element={<Recover />} />
        <Route element={<LegacyFrame />}>
          <Route path="items" element={<Browse />} />
          <Route path="reports/new" element={<RequireAuth><ReportForm key="new" /></RequireAuth>} />
          <Route path="reports/:id" element={<ReportDetail />} />
          <Route path="reports/:id/edit" element={<RequireAuth><ReportForm key="edit" /></RequireAuth>} />
          <Route path="my/reports" element={<RequireAuth><MyReports /></RequireAuth>} />
          <Route path="my/claims" element={<RequireAuth><MyClaims /></RequireAuth>} />
          <Route path="my/claims/:id" element={<RequireAuth><ClaimDetail /></RequireAuth>} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Route>
      <Route path="admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
        <Route index element={<LegacyAdmin><AdminDashboard /></LegacyAdmin>} />
        <Route path="claims/:id" element={<RequirePermission permission="claims.review"><LegacyAdmin><AdminClaim /></LegacyAdmin></RequirePermission>} />
        <Route path="students" element={<RequirePermission permission="students.manage"><Students /></RequirePermission>} />
        <Route path="registry" element={<RequirePermission permission="students.manage"><Registry /></RequirePermission>} />
        <Route path="admins" element={<RequirePermission permission="admins.manage"><Admins /></RequirePermission>} />
        <Route path="audit" element={<RequirePermission permission="audit.view"><AuditLog /></RequirePermission>} />
      </Route>
    </Routes>
  );
}
