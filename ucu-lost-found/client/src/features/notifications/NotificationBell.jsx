// Header bell: unread count in signal pink, and a panel with the latest notifications.
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { api } from '../../api';
import { cx } from '../../design/primitives';
import { timeAgo, useNotifications } from './NotificationsContext';
import { NOTE_ICON } from './NotificationsPage';

export default function NotificationBell() {
  const { unread, setUnread } = useNotifications();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    setItems(null);
    api.get('/api/me/notifications').then((d) => { setItems(d.items.slice(0, 6)); setUnread(d.unread); }).catch(() => setItems([]));
    const onDoc = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); ref.current?.querySelector('button')?.focus(); } };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open, setUnread]);

  const openItem = async (n) => {
    setOpen(false);
    if (!n.readAt) api.post('/api/me/notifications/read', { ids: [n.id] }).then((d) => setUnread(d.unread)).catch(() => {});
    if (n.link) navigate(n.link);
  };
  const markAll = async () => {
    const d = await api.post('/api/me/notifications/read', { all: true });
    setUnread(d.unread);
    setItems((list) => list?.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })));
  };

  return (
    <div ref={ref} className="relative">
      <button type="button" aria-expanded={open} aria-controls="bell-panel" onClick={() => setOpen((o) => !o)}
        className="relative grid size-11 place-items-center rounded-control text-ink hover:bg-mist">
        <Bell aria-hidden="true" className="size-5" />
        {unread > 0 && (
          <span aria-hidden="true" className="absolute right-1 top-1 grid min-w-5 place-items-center rounded-full bg-signal-600 px-1 text-[0.68rem] font-bold leading-5 text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
        <span className="sr-only">Notifications{unread ? `, ${unread} unread` : ''}</span>
      </button>
      {open && (
        <div id="bell-panel" className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-card border border-line bg-white text-ink shadow-pop">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-sm font-bold">Notifications</h2>
            {unread > 0 && (
              <button type="button" onClick={markAll} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-900">
                <CheckCheck aria-hidden="true" className="size-4" />Mark all read
              </button>
            )}
          </div>
          {!items && <p className="px-4 py-6 text-sm text-muted">Loading…</p>}
          {items?.length === 0 && <p className="px-4 py-6 text-sm text-muted">Nothing yet. We’ll tell you here when something may be yours.</p>}
          {items?.length > 0 && (
            <ul className="max-h-96 divide-y divide-line overflow-y-auto">
              {items.map((n) => {
                const Icon = NOTE_ICON[n.type] || Bell;
                return (
                  <li key={n.id}>
                    <button type="button" onClick={() => openItem(n)} className={cx('flex w-full gap-3 px-4 py-3 text-left hover:bg-mist', !n.readAt && 'bg-signal-50/60')}>
                      <Icon aria-hidden="true" className={cx('mt-0.5 size-4 shrink-0', n.type === 'match_found' ? 'text-signal-600' : 'text-brand-700')} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <span className={cx('text-sm', !n.readAt && 'font-semibold')}>{n.title}</span>
                          {!n.readAt && <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-signal-600" />}
                        </span>
                        <span className="line-clamp-2 block text-xs text-muted">{n.body}</span>
                        <span className="mt-0.5 block text-[0.7rem] text-muted">{timeAgo(n.createdAt)}{!n.readAt && <span className="sr-only">, unread</span>}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <Link to="/notifications" onClick={() => setOpen(false)} className="block border-t border-line px-4 py-3 text-center text-sm font-semibold text-brand-700 hover:bg-mist">
            See all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
