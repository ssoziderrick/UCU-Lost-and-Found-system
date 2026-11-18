import { Link, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { RequireAdmin, RequireAuth } from './components/Guards';
import { usePageTitle } from './components/ui';
import Browse from './pages/Browse';
import ReportDetail from './pages/ReportDetail';
import ReportForm from './pages/ReportForm';
import { Login, Register } from './pages/Auth';
import { ClaimDetail, MyClaims, MyReports } from './pages/Mine';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminClaim from './pages/admin/AdminClaim';

function NotFound() {
  usePageTitle('Page not found');
  return (
    <div className="empty">
      <h1>Page not found</h1>
      <p>The page you asked for doesn't exist. <Link to="/">Go back to browsing items</Link>.</p>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Browse />} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="reports/new" element={<RequireAuth><ReportForm key="new" /></RequireAuth>} />
        <Route path="reports/:id" element={<ReportDetail />} />
        <Route path="reports/:id/edit" element={<RequireAuth><ReportForm key="edit" /></RequireAuth>} />
        <Route path="my/reports" element={<RequireAuth><MyReports /></RequireAuth>} />
        <Route path="my/claims" element={<RequireAuth><MyClaims /></RequireAuth>} />
        <Route path="my/claims/:id" element={<RequireAuth><ClaimDetail /></RequireAuth>} />
        <Route path="admin" element={<RequireAdmin><AdminDashboard /></RequireAdmin>} />
        <Route path="admin/claims/:id" element={<RequireAdmin><AdminClaim /></RequireAdmin>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
