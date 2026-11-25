// Account disclosure menu: shows who is signed in and the sign-out action.
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, LogOut } from 'lucide-react';
import { cx } from '../design/primitives';

export const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');

export default function UserMenu({ user, onLogout, tone = 'light', align = 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); ref.current?.querySelector('button')?.focus(); } };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const dark = tone === 'dark';
  return (
    <div ref={ref} className="relative">
      <button
        type="button" aria-expanded={open} aria-controls="user-menu" onClick={() => setOpen((o) => !o)}
        className={cx('flex min-h-11 items-center gap-2 rounded-control px-1.5 py-1', dark ? 'text-white hover:bg-white/10' : 'hover:bg-mist')}
      >
        <span aria-hidden="true" className={cx('grid size-9 place-items-center rounded-full text-sm font-bold',
          dark ? 'bg-white/15 text-white' : 'bg-brand-50 text-brand-800')}>{initials(user.fullName)}</span>
        <span className="sr-only">Account menu for {user.fullName}</span>
        <ChevronDown aria-hidden="true" className="size-4" />
      </button>
      {open && (
        <div id="user-menu" className={cx('absolute z-50 mt-2 w-64 rounded-card border border-line bg-white p-2 text-ink shadow-pop',
          align === 'right' ? 'right-0' : 'left-0', align === 'up' && 'bottom-full mb-2')}>
          <div className="border-b border-line px-3 pb-3 pt-2">
            <p className="font-semibold">{user.fullName}</p>
            <p className="truncate text-sm text-muted">{user.role === 'admin' ? 'Administrator' : 'Student'} · {user.email}</p>
          </div>
          <button type="button" onClick={onLogout}
            className="mt-1 flex min-h-11 w-full items-center gap-2 rounded-md px-3 text-left font-medium hover:bg-mist">
            <LogOut aria-hidden="true" className="size-4" /> Log out
          </button>
        </div>
      )}
    </div>
  );
}
