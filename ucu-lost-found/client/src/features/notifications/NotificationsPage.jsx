// Notification history: all or unread, mark read, and the email preference.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, ClipboardCheck, ClipboardList, ClipboardX, PackageCheck, Sparkles } from 'lucide-react';
import { api } from '../../api';
import { usePageTitle } from '../../components/ui';
import { Button, Card, EmptyState, Notice, PageHeader, Spinner, cx } from '../../design/primitives';
import { Pagination } from '../../design/data';
import { timeAgo, useNotifications } from './NotificationsContext';

export const NOTE_ICON = {
  match_found: Sparkles, claim_submitted: ClipboardList, claim_approved: ClipboardCheck, claim_rejected: ClipboardX, item_returned: PackageCheck,
};

export default function NotificationsPage() {
  usePageTitle('Notifications');
  const navigate = useNavigate();
  const { setUnread } = useNotifications();
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [prefNote, setPrefNote] = useState('');

  const load = () => api.get(`/api/me/notifications?page=${page}${filter === 'unread' ? '&unread=1' : ''}`)
    .then((d) => { setData(d); setUnread(d.unread); }).catch((e) => setError(e.message));
  useEffect(() => { setData(null); load(); }, [filter, page]); // eslint-disable-line react-hooks/exhaustive-deps

  const markAll = async () => { const d = await api.post('/api/me/notifications/read', { all: true }); setUnread(d.unread); load(); };
  const open = async (n) => {
    if (!n.readAt) { const d = await api.post('/api/me/notifications/read', { ids: [n.id] }); setUnread(d.unread); }
    if (n.link) navigate(n.link); else load();
  };
  const toggleEmail = async (e) => {
    try { const d = await api.patch('/api/me/preferences', { notifyByEmail: e.target.checked }); setPrefNote(d.message); setData((x) => ({ ...x, notifyByEmail: d.notifyByEmail })); } catch (err) { setError(err.message); }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6 md:py-8">
      <PageHeader title="Notifications" description="Potential matches for things you lost, and updates on your claims."
        actions={data?.unread > 0 && <Button variant="secondary" icon={CheckCheck} onClick={markAll}>Mark all read</Button>} />
      {error && <Notice type="error">{error}</Notice>}

      <div role="group" aria-label="Show" className="flex w-fit rounded-control border border-line-strong bg-white p-0.5">
        {[['all', 'All'], ['unread', `Unread${data?.unread ? ` (${data.unread})` : ''}`]].map(([v, l]) => (
          <button key={v} type="button" aria-pressed={filter === v} onClick={() => { setFilter(v); setPage(1); }}
            className={cx('min-h-10 rounded-md px-4 text-sm font-semibold', filter === v ? 'bg-brand-600 text-white' : 'text-muted hover:text-ink')}>{l}</button>
        ))}
      </div>

      {!data && !error && <Spinner label="Loading notifications…" />}
      {data?.items.length === 0 && (
        <EmptyState icon={Bell} title={filter === 'unread' ? 'You’re all caught up' : 'No notifications yet'}>
          When someone reports an item that may be yours, or your claim is decided, it appears here.
        </EmptyState>
      )}
      {data?.items.length > 0 && (
        <>
          <ul className="flex flex-col gap-2">
            {data.items.map((n) => {
              const Icon = NOTE_ICON[n.type] || Bell;
              return (
                <li key={n.id}>
                  <button type="button" onClick={() => open(n)}
                    className={cx('flex w-full gap-3 rounded-card border p-4 text-left transition-colors hover:border-line-strong',
                      n.readAt ? 'border-line bg-white' : 'border-signal-300 bg-signal-50/60')}>
                    <span className={cx('grid size-9 shrink-0 place-items-center rounded-full', n.type === 'match_found' ? 'bg-signal-100 text-signal-700' : 'bg-brand-50 text-brand-700')}>
                      <Icon aria-hidden="true" className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className={cx(!n.readAt && 'font-semibold')}>{n.title}{!n.readAt && <span className="sr-only"> (unread)</span>}</span>
                        <time className="text-xs text-muted" dateTime={n.createdAt}>{timeAgo(n.createdAt)}</time>
                      </span>
                      <span className="mt-0.5 block text-sm text-muted">{n.body}</span>
                      {n.link && <span className="mt-1 block text-sm font-semibold text-brand-700">{n.type === 'match_found' ? 'View the listing' : 'Open'}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <Pagination {...data} noun="notifications" onPage={setPage} />
        </>
      )}

      {data && (
        <Card className="flex flex-col gap-2 p-4">
          <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
            <span className="flex flex-col">
              <span className="font-semibold">Also email me</span>
              <span className="text-sm text-muted">Potential matches, claim decisions and confirmed returns, sent to your university email.</span>
            </span>
            <input type="checkbox" role="switch" checked={data.notifyByEmail} onChange={toggleEmail} className="size-5 shrink-0 accent-brand-600" />
          </label>
          {prefNote && <p className="text-sm text-success-700" role="status">{prefNote}</p>}
        </Card>
      )}
    </div>
  );
}
