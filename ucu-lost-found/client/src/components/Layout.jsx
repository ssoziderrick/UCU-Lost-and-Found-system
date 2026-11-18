import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';

export default function Layout() {
  const { user, isAdmin, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const mainRef = useRef(null);
  const prevPath = useRef(null);

  // On every page change: close the mobile menu and move focus to the main content
  // so keyboard and screen-reader users start at the new page.
  useEffect(() => {
    setMenuOpen(false);
    const isFirstLoad = prevPath.current === null;
    const changed = prevPath.current !== location.pathname;
    prevPath.current = location.pathname;
    if (isFirstLoad || !changed) return; // on first load keep the skip link as the first Tab stop
    mainRef.current?.focus();
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate('/', { state: { flash: 'You have been logged out.' } });
  };

  return (
    <>
      <a href="#main" className="skip-link">Skip to main content</a>
      <header className="site-header">
        <div className="container header-inner">
          <Link to="/" className="brand" aria-label="UCU Lost and Found home">
            <svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="#f2b705" /><circle cx="14" cy="14" r="7" fill="none" stroke="#17365d" strokeWidth="3" /><path d="M19 19l6 6" stroke="#17365d" strokeWidth="3" strokeLinecap="round" /></svg>
            <span>UCU <strong>Lost &amp; Found</strong></span>
          </Link>
          <button type="button" className="menu-toggle" aria-expanded={menuOpen} aria-controls="main-nav"
            onClick={() => setMenuOpen((o) => !o)}>
            <span aria-hidden="true">{menuOpen ? '✕' : '☰'}</span> Menu
          </button>
          <nav id="main-nav" className={`main-nav${menuOpen ? ' open' : ''}`} aria-label="Main">
            <ul>
              <li><NavLink to="/" end>Browse items</NavLink></li>
              {user && !isAdmin && <li><NavLink to="/reports/new">Report an item</NavLink></li>}
              {user && <li><NavLink to="/my/reports">My reports</NavLink></li>}
              {user && !isAdmin && <li><NavLink to="/my/claims">My claims</NavLink></li>}
              {isAdmin && <li><NavLink to="/admin">Admin</NavLink></li>}
              {!user && <li><NavLink to="/login">Log in</NavLink></li>}
              {!user && <li><NavLink to="/register" className="nav-cta">Register</NavLink></li>}
              {user && (
                <li className="user-li">
                  <span className="user-name">{user.fullName.split(' ')[0]}{isAdmin ? ' (Admin)' : ''}</span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={handleLogout}>Log out</button>
                </li>
              )}
            </ul>
          </nav>
        </div>
      </header>
      <main id="main" tabIndex={-1} ref={mainRef} className="container main">
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="container">
          <p>UCU Campus Lost &amp; Found — a CSC1202 student project. All records shown are fictional.</p>
          <p>Never put identifying marks in public descriptions or photos. Collect items only from the Lost &amp; Found office.</p>
        </div>
      </footer>
    </>
  );
}
