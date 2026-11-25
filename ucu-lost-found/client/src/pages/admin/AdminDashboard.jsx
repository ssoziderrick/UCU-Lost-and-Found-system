import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { api, qs } from '../../api';
import { Alert, EmptyState, Field, Loading, StatusBadge, TypeBadge, formatDate, usePageTitle } from '../../components/ui';
import { useAuth } from '../../AuthContext';

export default function AdminDashboard() {
  usePageTitle('Administrator dashboard');
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const { can } = useAuth();
  const tabs = [['claims', 'Claims to review', 'claims.review'], ['reports', 'All reports', 'reports.moderate']].filter((t) => can(t[2]));
  const tab = tabs.some((t) => t[0] === params.get('tab')) ? params.get('tab') : tabs[0]?.[0];
  const [stats, setStats] = useState(null);
  const [flash, setFlash] = useState(location.state?.flash || '');

  const loadStats = useCallback(() => { if (can('stats.view')) api.get('/api/admin/stats').then(setStats).catch(() => {}); }, [can]);
  useEffect(() => { loadStats(); }, [loadStats]);

  return (
    <>
      <h1>Administrator dashboard</h1>
      <Alert type="success" onClose={() => setFlash('')}>{flash}</Alert>
      <ul className="stats" aria-label="Summary">
        {[['Pending claims', stats?.pendingClaims], ['Awaiting collection', stats?.awaitingCollection],
          ['Open found items', stats?.openFound], ['Open lost reports', stats?.openLost], ['Returned', stats?.returned]]
          .map(([label, n]) => <li key={label} className="stat card"><span className="stat-n">{n ?? '–'}</span><span>{label}</span></li>)}
      </ul>
      <div className="tabs" role="tablist" aria-label="Admin sections">
        {tabs.map(([key, label]) => (
          <button key={key} type="button" role="tab" id={`tab-${key}`} aria-selected={tab === key} aria-controls={`panel-${key}`}
            tabIndex={tab === key ? 0 : -1} className={`tab${tab === key ? ' active' : ''}`}
            onClick={() => setParams({ tab: key })}
            onKeyDown={(e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const next = tabs[(tabs.findIndex((t) => t[0] === tab) + 1) % tabs.length][0]; setParams({ tab: next }); document.getElementById(`tab-${next}`)?.focus(); } }}>
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'claims' && <ClaimsQueue reportId={params.get('report')} />}
        {tab === 'reports' && <ReportsAdmin onChange={loadStats} setFlash={setFlash} />}
        {!tab && <EmptyState title="Nothing to show for your role"><p>Use the menu to open the sections your role allows.</p></EmptyState>}
      </div>
    </>
  );
}

function ClaimsQueue({ reportId }) {
  const [status, setStatus] = useState('pending');
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setItems(null); setError('');
    api.get(`/api/admin/claims${qs({ status: reportId ? '' : status, reportId })}`).then((d) => setItems(d.items)).catch((e) => setError(e.message));
  }, [status, reportId]);

  return (
    <section className="section">
      {reportId
        ? <p>Showing all claims for report #{reportId}. <Link to="/admin">Show the full queue</Link></p>
        : (
          <div className="field inline-field">
            <label htmlFor="claim-status">Show claims</label>
            <select id="claim-status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="pending">Pending review</option>
              <option value="approved">Approved – awaiting collection</option>
              <option value="collected">Collected</option>
              <option value="rejected">Rejected</option>
              <option value="">All</option>
            </select>
          </div>
        )}
      <Alert type="error">{error}</Alert>
      {!items && !error && <Loading label="Loading claims…" />}
      {items && items.length === 0 && <EmptyState title="Nothing here">No claims match this filter.</EmptyState>}
      {items && items.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Ownership claims</caption>
            <thead><tr><th scope="col">Item</th><th scope="col">Claimant</th><th scope="col">Submitted</th><th scope="col">Claims on item</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Action</span></th></tr></thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id}>
                  <th scope="row">{c.reportTitle}<div className="meta"><StatusBadge status={c.reportStatus} /></div></th>
                  <td data-label="Claimant">{c.claimantName}</td>
                  <td data-label="Submitted">{formatDate(c.createdAt)}</td>
                  <td data-label="Claims on item">{c.claimsOnItem > 1 ? <strong className="warn-text">{c.claimsOnItem} competing</strong> : c.claimsOnItem}</td>
                  <td data-label="Status"><StatusBadge status={c.status} /></td>
                  <td><Link className="btn btn-primary btn-sm" to={`/admin/claims/${c.id}`}>{c.status === 'pending' ? 'Review' : c.status === 'approved' ? 'Confirm return' : 'View'}<span className="sr-only"> claim by {c.claimantName} for {c.reportTitle}</span></Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ReportsAdmin({ onChange, setFlash }) {
  const [filters, setFilters] = useState({ status: '', type: '' });
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');

  const load = useCallback(() => {
    setItems(null);
    api.get(`/api/admin/reports${qs(filters)}`).then((d) => setItems(d.items)).catch((e) => setError(e.message));
  }, [filters]);
  useEffect(() => { load(); }, [load]);

  const remove = async (e) => {
    e.preventDefault();
    if (reason.trim().length < 5) { setReasonError('Reason must be at least 5 characters so the reporter understands why.'); return; }
    try {
      const d = await api.post(`/api/admin/reports/${removing}/remove`, { reason });
      setFlash(d.message); setRemoving(null); setReason(''); setReasonError(''); load(); onChange();
    } catch (err) { setReasonError(err.fields?.reason || err.message); }
  };
  const restore = async (id) => {
    try { const d = await api.post(`/api/admin/reports/${id}/restore`); setFlash(d.message); load(); onChange(); } catch (err) { setError(err.message); }
  };

  return (
    <section className="section">
      <div className="field-row">
        <div className="field">
          <label htmlFor="r-type">Type</label>
          <select id="r-type" value={filters.type} onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}>
            <option value="">All</option><option value="lost">Lost</option><option value="found">Found</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="r-status">Status</label>
          <select id="r-status" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
            <option value="">All</option><option value="open">Open</option><option value="awaiting_collection">Awaiting collection</option>
            <option value="returned">Returned</option><option value="closed">Resolved by reporter</option><option value="removed">Removed</option>
          </select>
        </div>
      </div>
      <Alert type="error">{error}</Alert>
      {!items && !error && <Loading label="Loading reports…" />}
      {items && items.length === 0 && <EmptyState title="No reports match" />}
      {items && items.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">All reports</caption>
            <thead><tr><th scope="col">Item</th><th scope="col">Type</th><th scope="col">Reporter</th><th scope="col">Private details</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id}>
                  <th scope="row"><Link to={`/reports/${r.id}`}>{r.title}</Link><div className="meta">{r.location} · {formatDate(r.eventDate)}</div></th>
                  <td data-label="Type"><TypeBadge type={r.type} /></td>
                  <td data-label="Reporter">{r.reporterName}<div className="meta">{r.reporterEmail}</div></td>
                  <td data-label="Private details" className="small">{r.privateDetails || '—'}</td>
                  <td data-label="Status"><StatusBadge status={r.status} />{r.pendingClaims > 0 && <div className="meta"><Link to={`/admin?tab=claims&report=${r.id}`}>{r.pendingClaims} pending claim(s)</Link></div>}</td>
                  <td>
                    {r.status === 'removed'
                      ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => restore(r.id)}>Restore<span className="sr-only"> {r.title}</span></button>
                      : ['open', 'closed'].includes(r.status) && <button type="button" className="btn btn-danger btn-sm" onClick={() => { setRemoving(r.id); setReason(''); setReasonError(''); }}>Remove<span className="sr-only"> {r.title}</span></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {removing && (
        <form className="card section" onSubmit={remove} noValidate aria-labelledby="rm-title">
          <h2 id="rm-title" className="h3">Remove report #{removing} from public listings</h2>
          <Field id="rm-reason" label="Reason" required error={reasonError} hint="e.g. Contains private contact details; duplicate report.">
            {(p) => <input {...p} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} />}
          </Field>
          <div className="btn-row"><button type="submit" className="btn btn-danger">Remove report</button><button type="button" className="btn btn-ghost" onClick={() => setRemoving(null)}>Cancel</button></div>
        </form>
      )}
    </section>
  );
}
