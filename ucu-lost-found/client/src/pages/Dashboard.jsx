// Student dashboard. All counts are derived from the student's own reports and claims (GET /api/me/*).
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bell, Camera, ClipboardList, FileText, PackageCheck, PackageSearch, Search, Sparkles } from 'lucide-react';
import MatchList, { useMatches } from '../features/matches/MatchList';
import { timeAgo, useNotifications } from '../features/notifications/NotificationsContext';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { formatDate, usePageTitle } from '../components/ui';
import { Button, Card, EmptyState, Notice, PageHeader, StatCard, StatusBadge, TypeBadge, cx } from '../design/primitives';
import { categoryIcon } from '../design/ItemCard';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

export default function Dashboard() {
  usePageTitle('Dashboard');
  const { user } = useAuth();
  const location = useLocation();
  const [reports, setReports] = useState(null);
  const [claims, setClaims] = useState(null);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState(location.state?.flash || '');
  const matches = useMatches();
  const { unread } = useNotifications();
  const [recentNotes, setRecentNotes] = useState(null);
  useEffect(() => { api.get('/api/me/notifications').then((d) => setRecentNotes(d.items.slice(0, 4))).catch(() => setRecentNotes([])); }, [unread]);

  useEffect(() => {
    Promise.all([api.get('/api/me/reports'), api.get('/api/me/claims')])
      .then(([r, c]) => { setReports(r.items); setClaims(c.items); })
      .catch((e) => setError(e.message));
  }, []);

  const ready = reports && claims;
  const count = (list, pred) => (list ? list.filter(pred).length : null);
  const lost = count(reports, (r) => r.type === 'lost');
  const found = count(reports, (r) => r.type === 'found');
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 md:py-8">
      {flash && <Notice type="success" onClose={() => setFlash('')}>{flash}</Notice>}
      <PageHeader
        eyebrow={today}
        title={`${greeting()}, ${user.fullName.split(' ')[0]}`}
        actions={(
          <>
            <Button to="/reports/new?type=found" variant="secondary" icon={Camera}>I found something</Button>
            <Button to="/reports/new?type=lost" icon={PackageSearch}>I lost something</Button>
          </>
        )}
      />

      {error && <Notice type="error" title="We couldn’t load your dashboard.">{error}</Notice>}

      <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="My reports" icon={FileText} value={ready ? reports.length : null}
          detail={ready ? `${lost} lost · ${found} found` : undefined} />
        <StatCard label="Potential matches" icon={Sparkles} tone={matches.items?.length ? 'signal' : 'default'} value={matches.items ? matches.items.length : null}
          detail={matches.items ? `${matches.items.filter((x) => x.strength === 'strong').length} strong` : undefined} />
        <StatCard label="Active claims" icon={ClipboardList} value={count(claims, (c) => c.status === 'pending')}
          detail={ready ? `${count(claims, (c) => c.status === 'approved')} approved, ready to collect` : undefined} />
        <StatCard label="Returned to me" icon={PackageCheck} value={count(claims, (c) => c.status === 'collected')} detail="Collected items" />
      </section>

      {matches.items?.length > 0 && (
        <Card as="section" aria-labelledby="matches-title" className="flex flex-col gap-4 border-signal-300 p-5">
          <div className="flex flex-col gap-1">
            <h2 id="matches-title" className="flex items-center gap-2 text-lg font-bold"><Sparkles aria-hidden="true" className="size-5 text-signal-600" />Potential matches for your lost items</h2>
            <p className="text-sm text-muted">Found items that look like something you reported missing. Open one and make a private claim if it’s yours.</p>
          </div>
          <MatchList items={matches.items} onDismiss={matches.dismiss} limit={4} />
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Card as="section" aria-labelledby="claims-title" className="flex flex-col gap-4 p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 id="claims-title" className="text-lg font-bold">My claims</h2>
            <Link to="/my/claims" className="text-sm font-semibold text-brand-700">All claims</Link>
          </div>
          {ready && claims.length === 0 && (
            <EmptyState icon={Search} title="No claims yet" action={<Button to="/items?type=found" variant="subtle">Browse found items</Button>}>
              If you see your item in the found listings, open it and submit a private claim.
            </EmptyState>
          )}
          <ul className="flex flex-col gap-3">
            {ready && claims.slice(0, 4).map((c) => (
              <li key={c.id} className="rounded-control border border-line p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link to={`/my/claims/${c.id}`} className="font-semibold text-ink no-underline hover:text-brand-700">{c.reportTitle}</Link>
                  <StatusBadge status={c.status} />
                </div>
                <ClaimTracker status={c.status} />
                {c.status === 'approved' && c.collectionInstructions && (
                  <p className="mt-2 text-sm"><span className="font-semibold">Collect: </span>{c.collectionInstructions}</p>
                )}
                {c.status === 'rejected' && c.adminReason && (
                  <p className="mt-2 text-sm text-muted"><span className="font-semibold text-ink">Reason: </span>{c.adminReason}</p>
                )}
              </li>
            ))}
          </ul>
        </Card>

        <div className="flex flex-col gap-6">
        <Card as="section" aria-labelledby="notes-title" className="flex flex-col gap-3 p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 id="notes-title" className="flex items-center gap-2 text-lg font-bold"><Bell aria-hidden="true" className="size-5 text-brand-700" />Notifications
              {unread > 0 && <span className="rounded-full bg-signal-600 px-2 py-0.5 text-xs font-bold text-white">{unread} new</span>}</h2>
            <Link to="/notifications" className="text-sm font-semibold text-brand-700">All</Link>
          </div>
          {recentNotes?.length === 0 && <p className="text-sm text-muted">Nothing yet. We’ll tell you when something may be yours.</p>}
          <ul className="flex flex-col divide-y divide-line">
            {recentNotes?.map((n) => (
              <li key={n.id} className="flex gap-2 py-2.5 first:pt-0 last:pb-0">
                <span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${n.readAt ? 'bg-line-strong' : 'bg-signal-600'}`} />
                <div className="min-w-0">
                  {n.link ? <Link to={n.link} className="text-sm font-semibold text-ink no-underline hover:text-brand-700">{n.title}</Link> : <p className="text-sm font-semibold">{n.title}</p>}
                  <p className="line-clamp-2 text-xs text-muted">{n.body}</p>
                  <p className="text-[0.7rem] text-muted">{timeAgo(n.createdAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <Card as="section" aria-labelledby="reports-title" className="flex flex-col gap-4 p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 id="reports-title" className="text-lg font-bold">My recent reports</h2>
            <Link to="/my/reports" className="text-sm font-semibold text-brand-700">All reports</Link>
          </div>
          {ready && reports.length === 0 && (
            <p className="text-muted">You haven’t reported anything yet. Use the buttons above to report a lost or found item.</p>
          )}
          <ul className="flex flex-col divide-y divide-line">
            {ready && reports.slice(0, 5).map((r) => {
              const Icon = categoryIcon(r.category);
              return (
                <li key={r.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="grid size-10 shrink-0 place-items-center rounded-control bg-mist text-muted"><Icon aria-hidden="true" className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <Link to={`/reports/${r.id}`} className="block truncate font-semibold text-ink no-underline hover:text-brand-700">{r.title}</Link>
                    <p className="truncate text-sm text-muted">{r.location} · {formatDate(r.eventDate)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1"><TypeBadge type={r.type} /><StatusBadge status={r.status} /></div>
                </li>
              );
            })}
          </ul>
        </Card>
        </div>
      </div>
    </div>
  );
}

const STEPS = ['Submitted', 'Under review', 'Decision', 'Collected'];

/** Four-step claim progress. Rejected claims stop at "Decision". */
function ClaimTracker({ status }) {
  const reached = { pending: 1, approved: 2, rejected: 2, collected: 3 }[status] ?? 0;
  return (
    <ol className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted" aria-label="Claim progress">
      {STEPS.map((label, i) => {
        const done = i <= reached;
        const current = i === reached;
        return (
          <li key={label} className="flex items-center gap-2" aria-current={current ? 'step' : undefined}>
            {i > 0 && <span aria-hidden="true" className={cx('h-0.5 w-5 rounded', done ? 'bg-brand-600' : 'bg-line')} />}
            <span aria-hidden="true" className={cx('size-2.5 rounded-full', done ? (status === 'rejected' && i === 2 ? 'bg-danger-700' : 'bg-brand-600') : 'bg-line-strong')} />
            <span className={cx(current && 'font-semibold text-ink')}>{i === 2 && status === 'rejected' ? 'Rejected' : label}</span>
          </li>
        );
      })}
    </ol>
  );
}
