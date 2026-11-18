import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { Alert, EmptyState, Loading, StatusBadge, TypeBadge, formatDate, usePageTitle } from '../components/ui';

export function MyReports() {
  usePageTitle('My reports');
  const { isAdmin } = useAuth();
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.get('/api/me/reports').then((d) => setItems(d.items)).catch((e) => setError(e.message)); }, []);

  return (
    <>
      <div className="page-head">
        <h1>My reports</h1>
        {!isAdmin && <Link className="btn btn-primary" to="/reports/new">Report an item</Link>}
      </div>
      <Alert type="error">{error}</Alert>
      {!items && !error && <Loading label="Loading your reports…" />}
      {items && items.length === 0 && (
        <EmptyState title="You haven't reported anything yet">
          <p>Lost or found something? <Link to="/reports/new">Create a report</Link>.</p>
        </EmptyState>
      )}
      {items && items.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Your lost and found reports</caption>
            <thead><tr><th scope="col">Item</th><th scope="col">Type</th><th scope="col">Date</th><th scope="col">Location</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id}>
                  <th scope="row"><Link to={`/reports/${r.id}`}>{r.title}</Link><div className="meta">{r.category}</div></th>
                  <td data-label="Type"><TypeBadge type={r.type} /></td>
                  <td data-label="Date">{formatDate(r.eventDate)}</td>
                  <td data-label="Location">{r.location}</td>
                  <td data-label="Status"><StatusBadge status={r.status} /></td>
                  <td>{r.status === 'open' && <Link to={`/reports/${r.id}/edit`} aria-label={`Edit ${r.title}`}>Edit</Link>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export function MyClaims() {
  usePageTitle('My claims');
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.get('/api/me/claims').then((d) => setItems(d.items)).catch((e) => setError(e.message)); }, []);

  return (
    <>
      <h1>My claims</h1>
      <p>Your claims are private: only you and the administrator can read them.</p>
      <Alert type="error">{error}</Alert>
      {!items && !error && <Loading label="Loading your claims…" />}
      {items && items.length === 0 && (
        <EmptyState title="No claims yet"><p><Link to="/?type=found">Browse found items</Link> to see if yours has been handed in.</p></EmptyState>
      )}
      {items && items.length > 0 && (
        <ul className="claim-list">
          {items.map((c) => (
            <li key={c.id} className="card claim-item">
              <div>
                <h2 className="h3"><Link to={`/my/claims/${c.id}`}>{c.reportTitle}</Link></h2>
                <p className="meta">Submitted {formatDate(c.createdAt)}{c.reviewedAt ? ` · Reviewed ${formatDate(c.reviewedAt)}` : ''}</p>
                {c.status === 'approved' && <p className="callout-ok"><strong>Collect your item:</strong> {c.collectionInstructions}</p>}
                {c.adminReason && c.status !== 'approved' && <p><strong>Administrator's response:</strong> {c.adminReason}</p>}
              </div>
              <StatusBadge status={c.status} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function ClaimDetail() {
  const { id } = useParams();
  const location = useLocation();
  usePageTitle('Claim details');
  const [claim, setClaim] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.get(`/api/claims/${id}`).then((d) => setClaim(d.claim)).catch((e) => setError(e.message)); }, [id]);

  if (error) return <><Alert type="error">{error}</Alert><Link to="/my/claims">← My claims</Link></>;
  if (!claim) return <Loading label="Loading claim…" />;
  return (
    <>
      <p className="crumbs"><Link to="/my/claims">← My claims</Link></p>
      <Alert type="success">{location.state?.flash}</Alert>
      <article className="card section">
        <div className="page-head"><h1>Claim for “{claim.reportTitle}”</h1><StatusBadge status={claim.status} /></div>
        <ol className="timeline" aria-label="Claim progress">
          <li className="done">Submitted {formatDate(claim.createdAt)}</li>
          <li className={claim.reviewedAt ? 'done' : ''}>{claim.reviewedAt ? `Reviewed ${formatDate(claim.reviewedAt)}` : 'Waiting for administrator review'}</li>
          <li className={claim.status === 'collected' ? 'done' : ''}>{claim.status === 'collected' ? `Collected ${formatDate(claim.collectedAt)}` : 'Item collected'}</li>
        </ol>
        {claim.status === 'approved' && <div className="callout-ok"><strong>Approved — collect your item:</strong> {claim.collectionInstructions}</div>}
        {claim.adminReason && <><h2 className="h3">Administrator's response</h2><p className="prewrap">{claim.adminReason}</p></>}
        <h2 className="h3">Your explanation (private)</h2>
        <p className="prewrap">{claim.evidence}</p>
        <p><Link to={`/reports/${claim.reportId}`}>View the item listing</Link></p>
      </article>
    </>
  );
}
