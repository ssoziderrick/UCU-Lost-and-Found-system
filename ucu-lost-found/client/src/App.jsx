import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { SearchX } from 'lucide-react';
import AppShell from './layouts/AppShell';
import AdminLayout from './layouts/AdminLayout';
import { RequireAdmin, RequireAuth, RequireStudent } from './components/Guards';
import { Loading, usePageTitle } from './components/ui';
import { useAuth } from './AuthContext';
import { Button, EmptyState } from './design/primitives';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import Browse from './pages/Browse';
import ReportDetail from './pages/ReportDetail';
import ReportForm from './pages/ReportForm';
import { Login, Register } from './pages/Auth';
import { ClaimDetail, MyClaims, MyReports } from './pages/Mine';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminClaim from './pages/admin/AdminClaim';

/** Content frame for pages that still use the v1 stylesheet; removed as each page is rebuilt. */
function LegacyFrame() {
  return <div className="legacy-page mx-auto max-w-6xl px-4 py-6 sm:px-6 md:py-8"><Outlet /></div>;
}

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
        <Route element={<LegacyFrame />}>
          <Route path="items" element={<Browse />} />
          <Route path="login" element={<Login />} />
          <Route path="register" element={<Register />} />
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
        <Route index element={<AdminDashboard />} />
        <Route path="claims/:id" element={<AdminClaim />} />
      </Route>
    </Routes>
  );
}
