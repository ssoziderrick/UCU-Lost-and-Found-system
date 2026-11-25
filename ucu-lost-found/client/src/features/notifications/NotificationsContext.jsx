// Unread-notification count shared by the bell, the dashboard and the notifications page.
// Refreshed on sign-in, on every page change, when the tab regains focus and once a minute.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../AuthContext';

const Ctx = createContext({ unread: 0, refresh: () => {}, setUnread: () => {} });

export function NotificationsProvider({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(() => {
    if (!user) { setUnread(0); return Promise.resolve(); }
    return api.get('/api/me/notifications/unread-count').then((d) => setUnread(d.count)).catch(() => {});
  }, [user]);

  useEffect(() => { refresh(); }, [refresh, location.pathname]);
  useEffect(() => {
    if (!user) return undefined;
    const timer = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 60000);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, [user, refresh]);

  const value = useMemo(() => ({ unread, refresh, setUnread }), [unread, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useNotifications = () => useContext(Ctx);

/** Short relative time: "5 min ago", "yesterday", "3 Nov". */
export function timeAgo(value) {
  const t = new Date(String(value).replace(' ', 'T')).getTime();
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 172800) return 'yesterday';
  return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
