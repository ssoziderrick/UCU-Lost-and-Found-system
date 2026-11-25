// Shell for the public site and the student side.
// Visitors get the public header; signed-in students get the app header plus a bottom tab bar on phones;
// administrators browsing public pages get a link back to the admin console.
import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { ClipboardList, FileText, House, LayoutDashboard, Menu, Plus, Search, X } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { Logo } from '../design/Logo';
import { Button, cx } from '../design/primitives';
import UserMenu from './UserMenu';
import useRouteFocus from './useRouteFocus';

const STUDENT_NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/items', label: 'Browse items', icon: Search },
  { to: '/my/reports', label: 'My reports', icon: FileText },
  { to: '/my/claims', label: 'My claims', icon: ClipboardList },
];

const desktopLink = ({ isActive }) => cx(
  'rounded-md px-3 py-2 text-[0.95rem] font-medium no-underline transition-colors',
  isActive ? 'bg-brand-50 text-brand-800' : 'text-muted hover:bg-mist hover:text-ink',
);

export default function AppShell() {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const mainRef = useRouteFocus(() => setMenuOpen(false));
  const isStudent = Boolean(user && !isAdmin);

  const handleLogout = async () => {
    await logout(() => navigate('/', { replace: true, state: { flash: 'You have been logged out.' } }));
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="skip-to-content">Skip to main content</a>

      <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link to={isStudent ? '/dashboard' : '/'} className="no-underline" aria-label="UCU Findora home">
            <Logo size={28} />
          </Link>

          {isStudent ? (
            <>
              <nav aria-label="Main" className="ml-4 hidden flex-1 items-center gap-1 md:flex">
                {STUDENT_NAV.map((n) => <NavLink key={n.to} to={n.to} className={desktopLink}>{n.label}</NavLink>)}
              </nav>
              <div className="ml-auto flex items-center gap-2">
                {/* Wrapped: Button sets display itself, so `hidden` on it would lose to `inline-flex`. */}
                <span className="hidden md:block"><Button to="/reports/new" icon={Plus}>Report an item</Button></span>
                <UserMenu user={user} onLogout={handleLogout} />
              </div>
            </>
          ) : (
            <>
              <nav aria-label="Main" className="ml-4 hidden flex-1 items-center gap-1 md:flex">
                <NavLink to="/items" className={desktopLink}>Browse items</NavLink>
                <Link to="/#how-it-works" className={desktopLink({ isActive: false })}>How it works</Link>
                <Link to="/#faq" className={desktopLink({ isActive: false })}>FAQ</Link>
              </nav>
              <div className="ml-auto hidden items-center gap-2 md:flex">
                {isAdmin ? (
                  <>
                    <Button to="/admin" variant="subtle">Admin console</Button>
                    <UserMenu user={user} onLogout={handleLogout} />
                  </>
                ) : (
                  <>
                    <Button to="/login" variant="ghost">Log in</Button>
                    <Button to="/register">Create account</Button>
                  </>
                )}
              </div>
              <button
                type="button" className="ml-auto grid size-11 place-items-center rounded-control hover:bg-mist md:hidden"
                aria-expanded={menuOpen} aria-controls="mobile-nav" onClick={() => setMenuOpen((o) => !o)}
              >
                {menuOpen ? <X aria-hidden="true" className="size-6" /> : <Menu aria-hidden="true" className="size-6" />}
                <span className="sr-only">{menuOpen ? 'Close menu' : 'Open menu'}</span>
              </button>
            </>
          )}
        </div>

        {!isStudent && menuOpen && (
          <nav id="mobile-nav" aria-label="Main" className="border-t border-line bg-white px-4 pb-4 pt-2 md:hidden">
            <ul className="flex flex-col gap-1">
              <li><NavLink to="/items" className={desktopLink}>Browse items</NavLink></li>
              <li><Link to="/#how-it-works" className={desktopLink({ isActive: false })}>How it works</Link></li>
              <li><Link to="/#faq" className={desktopLink({ isActive: false })}>FAQ</Link></li>
            </ul>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {isAdmin ? (
                <>
                  <Button to="/admin" variant="subtle">Admin console</Button>
                  <Button variant="secondary" onClick={handleLogout}>Log out</Button>
                </>
              ) : (
                <>
                  <Button to="/login" variant="secondary">Log in</Button>
                  <Button to="/register">Create account</Button>
                </>
              )}
            </div>
          </nav>
        )}
      </header>

      <main id="main" ref={mainRef} tabIndex={-1} className={cx('flex-1 focus:outline-none', isStudent && 'pb-24 md:pb-0')}>
        <Outlet />
      </main>

      <footer className={cx('border-t border-line bg-white', isStudent && 'mb-20 md:mb-0')}>
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-muted sm:px-6 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col gap-2">
            <Logo size={22} />
            <p className="max-w-md">Student project, not yet an official Uganda Christian University service. Records in this demo are fictional.</p>
          </div>
          <p className="max-w-sm">Never put identifying marks in a public description or photo. Collect items only from the lost-property office, with your student ID.</p>
        </div>
      </footer>

      {isStudent && <StudentTabBar />}
    </div>
  );
}

const TABS = [
  { to: '/dashboard', label: 'Home', icon: House },
  { to: '/items', label: 'Browse', icon: Search },
  { to: '/reports/new', label: 'Report', icon: Plus, primary: true },
  { to: '/my/reports', label: 'Reports', icon: FileText },
  { to: '/my/claims', label: 'Claims', icon: ClipboardList },
];

function StudentTabBar() {
  return (
    <nav aria-label="Quick navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {TABS.map(({ to, label, icon: Icon, primary }) => (
          <li key={to}>
            <NavLink to={to} end={to === '/reports/new'}
              className={({ isActive }) => cx('flex min-h-16 flex-col items-center justify-center gap-0.5 text-[0.7rem] font-medium no-underline',
                isActive && !primary ? 'text-brand-700' : 'text-muted')}>
              {primary
                ? <span className="-mt-5 grid size-12 place-items-center rounded-full bg-brand-600 text-white shadow-pop"><Icon aria-hidden="true" className="size-6" /></span>
                : <Icon aria-hidden="true" className="size-5" />}
              <span>{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
