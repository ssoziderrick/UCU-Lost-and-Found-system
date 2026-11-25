// Administrator console shell: navy sidebar on desktop, slide-over drawer on phones and tablets.
// Only sections that exist, and that the signed-in role may use, are listed.
import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ClipboardList, ExternalLink, FolderOpen, FolderTree, IdCard, LogOut, MapPinned, Menu, ScrollText, ShieldCheck, Sparkles, Users, X } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { Logo } from '../design/Logo';
import { cx } from '../design/primitives';
import { initials } from './UserMenu';
import useRouteFocus from './useRouteFocus';

const SECTIONS = [
  {
    heading: 'Cases',
    items: [
      { to: '/admin?tab=claims', label: 'Claims queue', icon: ClipboardList, permission: 'claims.review', match: (p, q) => p.startsWith('/admin/claims') || (p === '/admin' && (q.get('tab') || 'claims') === 'claims') },
      { to: '/admin/matches', label: 'Potential matches', icon: Sparkles, permission: 'claims.review', match: (p) => p === '/admin/matches' },
      { to: '/admin?tab=reports', label: 'All reports', icon: FolderOpen, permission: 'reports.moderate', match: (p, q) => p === '/admin' && q.get('tab') === 'reports' },
    ],
  },
  {
    heading: 'People',
    items: [
      { to: '/admin/students', label: 'Students', icon: Users, permission: 'students.manage', match: (p) => p === '/admin/students' },
      { to: '/admin/registry', label: 'Student registry', icon: IdCard, permission: 'students.manage', match: (p) => p === '/admin/registry' },
      { to: '/admin/admins', label: 'Administrators', icon: ShieldCheck, permission: 'admins.manage', match: (p) => p === '/admin/admins' },
    ],
  },
  {
    heading: 'Setup',
    items: [
      { to: '/admin/locations', label: 'Campus locations', icon: MapPinned, permission: 'locations.manage', match: (p) => p === '/admin/locations' },
      { to: '/admin/categories', label: 'Categories', icon: FolderTree, permission: 'categories.manage', match: (p) => p === '/admin/categories' },
    ],
  },
  {
    heading: 'Records',
    items: [
      { to: '/admin/audit', label: 'Audit log', icon: ScrollText, permission: 'audit.view', match: (p) => p === '/admin/audit' },
    ],
  },
];

export default function AdminLayout() {
  const { user, logout, can } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawer, setDrawer] = useState(false);
  const mainRef = useRouteFocus(() => setDrawer(false));

  useEffect(() => { setDrawer(false); }, [location.search]);
  useEffect(() => {
    if (!drawer) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setDrawer(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawer]);

  const handleLogout = async () => {
    await logout(() => navigate('/', { replace: true, state: { flash: 'You have been signed out.' } }));
  };

  const params = new URLSearchParams(location.search);
  const sidebar = (
    <div className="flex h-full flex-col gap-1 bg-ink px-3 py-4 text-[0.92rem] text-slate-300">
      <div className="flex items-center justify-between px-2 pb-4">
        <Link to="/admin" className="no-underline" aria-label="UCU Findora admin console">
          <Logo size={24} tone="dark" inner="#172033" />
        </Link>
        <span className="rounded bg-white/10 px-1.5 py-0.5 text-[0.65rem] font-semibold tracking-wider text-slate-300">ADMIN</span>
      </div>
      <nav aria-label="Admin" className="flex flex-1 flex-col gap-1">
        {SECTIONS.map((s) => ({ ...s, items: s.items.filter((i) => can(i.permission)) })).filter((s) => s.items.length).map((s) => (
          <div key={s.heading} className="flex flex-col gap-0.5">
            <p className="px-3 pb-1 pt-3 text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#93A3C8]">{s.heading}</p>
            {s.items.map(({ to, label, icon: Icon, match }) => {
              const active = match(location.pathname, params);
              return (
                <Link key={to} to={to} aria-current={active ? 'page' : undefined}
                  className={cx('flex min-h-10 items-center gap-2.5 rounded-md px-3 no-underline transition-colors',
                    active ? 'bg-brand-300/15 text-white shadow-[inset_3px_0_0_var(--color-brand-400)]' : 'text-slate-300 hover:bg-white/5 hover:text-white')}>
                  <Icon aria-hidden="true" className="size-4" />{label}
                </Link>
              );
            })}
          </div>
        ))}
        <p className="px-3 pb-1 pt-5 text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#93A3C8]">Site</p>
        <Link to="/items" className="flex min-h-10 items-center gap-2.5 rounded-md px-3 text-slate-300 no-underline hover:bg-white/5 hover:text-white">
          <ExternalLink aria-hidden="true" className="size-4" />Public listings
        </Link>
      </nav>
      <div className="mt-4 flex items-center gap-3 border-t border-white/10 px-2 pt-4">
        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-white/15 text-sm font-bold text-white">{initials(user.fullName)}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-white">{user.fullName}</p>
          <p className="text-xs text-[#93A3C8]">{user.adminRole?.name || 'Administrator'} · <span className="font-mono">{user.staffId}</span></p>
        </div>
        <button type="button" onClick={handleLogout} className="grid size-10 place-items-center rounded-md text-slate-300 hover:bg-white/10 hover:text-white">
          <LogOut aria-hidden="true" className="size-4" /><span className="sr-only">Sign out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-mist lg:grid lg:grid-cols-[15rem_1fr]">
      <a href="#main" className="skip-to-content">Skip to main content</a>

      <aside className="sticky top-0 hidden h-dvh lg:block">{sidebar}</aside>

      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Admin navigation">
          <button type="button" className="absolute inset-0 bg-ink/50" onClick={() => setDrawer(false)} aria-label="Close navigation" />
          <div className="relative h-full w-72 max-w-[85vw]">
            {sidebar}
            <button type="button" onClick={() => setDrawer(false)} autoFocus
              className="absolute right-2 top-3 grid size-10 place-items-center rounded-md text-white hover:bg-white/10">
              <X aria-hidden="true" className="size-5" /><span className="sr-only">Close navigation</span>
            </button>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex min-h-14 items-center gap-3 border-b border-line bg-white px-4 lg:hidden">
          <button type="button" onClick={() => setDrawer(true)} aria-expanded={drawer}
            className="grid size-11 place-items-center rounded-control hover:bg-mist">
            <Menu aria-hidden="true" className="size-6" /><span className="sr-only">Open admin navigation</span>
          </button>
          <Logo size={22} />
        </header>
        <main id="main" ref={mainRef} tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 focus:outline-none sm:px-6 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
