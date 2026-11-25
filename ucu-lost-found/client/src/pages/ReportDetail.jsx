import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { validateClaim } from '../validation';
import { Alert, ErrorSummary, Field, Loading, StatusBadge, TypeBadge, formatDate, usePageTitle } from '../components/ui';

export default function ReportDetail() {
  const { id } = useParams();
  const { user, isAdmin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState(location.state?.flash || '');
  usePageTitle(report ? report.title : 'Item details');

  const load = useCallback(() => {
    setError('');
    api.get(`/api/reports/${id}`).then((d) => setReport(d.report)).catch((e) => setError(e.message));
  }, [id]);
  useEffect(() => { load(); }, [load, user]);

  const closeReport = async () => {
    if (!window.confirm('Mark this lost item as resolved? It will show as resolved in listings.')) return;
    try { const d = await api.post(`/api/reports/${id}/close`); setFlash(d.message); load(); } catch (e) { setError(e.message); }
  };

  if (error && !report) return <><Alert type="error">{error}</Alert><p><Link to="/items">← Back to all items</Link></p></>;
  if (!report) return <Loading label="Loading item…" />;

  const done = report.status === 'returned' || report.status === 'closed';
  return (
    <>
      <p className="crumbs"><Link to="/items">← Back to all items</Link></p>
      <Alert type="success" onClose={() => setFlash('')}>{flash}</Alert>
      <Alert type="error">{error}</Alert>
      {report.status === 'returned' && <Alert type="info">This item has been returned to its owner{report.returnedAt ? ` on ${formatDate(report.returnedAt)}` : ''}. The search is over — no further claims are accepted.</Alert>}
      {report.status === 'awaiting_collection' && <Alert type="warning">A claim for this item has been approved and it is awaiting collection. New claims are not being accepted.</Alert>}
      {report.status === 'closed' && <Alert type="info">The reporter has marked this item as resolved.</Alert>}

      <article className={`detail card${done ? ' is-done' : ''}`}>
        <div className="detail-media">
          {report.hasPhoto
            ? <img src={`/api/reports/${report.id}/photo`} alt={`Photo of ${report.title}`} />
            : <div className="no-photo">No photo provided</div>}
        </div>
        <div className="detail-body">
          <div className="badges"><TypeBadge type={report.type} /><StatusBadge status={report.status} /></div>
          <h1>{report.title}</h1>
          <dl className="facts">
            <div><dt>Category</dt><dd>{report.category}</dd></div>
            <div><dt>{report.type === 'lost' ? 'Date lost' : 'Date found'}</dt><dd>{formatDate(report.eventDate)}</dd></div>
            <div><dt>Campus location</dt><dd>{report.location}{report.locationDetail ? ` — ${report.locationDetail}` : ''}</dd></div>
            <div><dt>Reported</dt><dd>{formatDate(report.createdAt)}</dd></div>
          </dl>
          <h2 className="h3">Description</h2>
          <p className="prewrap">{report.description}</p>

          {report.privateDetails !== undefined && report.type === 'found' && (
            <div className="private-box">
              <h2 className="h3">🔒 Private identifying details</h2>
              <p className="hint">Only you{isAdmin ? ' (administrator)' : ' and the administrator'} can see this. It is used to check ownership claims.</p>
              <p className="prewrap">{report.privateDetails || <em>None recorded.</em>}</p>
            </div>
          )}

          {report.isOwner && (
            <div className="btn-row">
              {report.status === 'open' && <Link className="btn btn-primary" to={`/reports/${report.id}/edit`}>Edit report</Link>}
              {report.status === 'open' && report.type === 'lost' && <button type="button" className="btn btn-ghost" onClick={closeReport}>I found it — mark resolved</button>}
              {report.type === 'found' && <p className="hint">Claims on items you found are reviewed privately by the administrator.</p>}
            </div>
          )}
          {isAdmin && <p><Link className="btn btn-primary" to={`/admin?report=${report.id}`}>Review claims in admin</Link></p>}
        </div>
      </article>

      {report.type === 'lost' && !report.isOwner && !done && (
        <section className="card section">
          <h2>Have you found this item?</h2>
          <p>Please don't arrange a handover privately. <Link to={user ? '/reports/new?type=found' : '/login'}>Report it as found</Link> and hand it to the Lost &amp; Found office so the owner can claim it safely.</p>
        </section>
      )}

      {report.type === 'found' && !report.isOwner && !isAdmin && (
        <ClaimSection report={report} user={user} onDone={(msg) => { setFlash(msg); load(); }} navigate={navigate} />
      )}
    </>
  );
}

function ClaimSection({ report, user, onDone, navigate }) {
  const [evidence, setEvidence] = useState('');
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  if (report.myClaim) {
    return (
      <section className="card section">
        <h2>Your claim</h2>
        <p>You submitted a claim on {formatDate(report.myClaim.createdAt)}. Status: <StatusBadge status={report.myClaim.status} /></p>
        <Link className="btn btn-primary" to={`/my/claims/${report.myClaim.id}`}>View claim and administrator response</Link>
      </section>
    );
  }
  if (report.status !== 'open') return null;
  if (!user) {
    return (
      <section className="card section">
        <h2>Is this yours?</h2>
        <p>Log in to submit a private ownership claim.</p>
        <button type="button" className="btn btn-primary" onClick={() => navigate('/login', { state: { from: `/reports/${report.id}` } })}>Log in to claim</button>
      </section>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    const errs = validateClaim({ evidence });
    setErrors(errs); setMessage('');
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const d = await api.post(`/api/reports/${report.id}/claims`, { evidence });
      onDone(d.message);
    } catch (err) {
      setErrors(err.fields || {}); setMessage(err.message);
    } finally { setBusy(false); }
  };

  return (
    <section className="card section" aria-labelledby="claim-title">
      <h2 id="claim-title">Is this yours? Submit a private claim</h2>
      <p>Explain why this item belongs to you. Mention details that are <strong>not</strong> in the public description or photo — for example an inscription, contents, a scratch or a lock-screen picture. Only you and the administrator will see this.</p>
      <form onSubmit={submit} noValidate>
        <ErrorSummary errors={errors} message={message && Object.keys(errors).length ? message : ''} />
        {message && !Object.keys(errors).length && <Alert type="error">{message}</Alert>}
        <Field id="evidence" label="Why do you believe this item is yours?" required error={errors.evidence}
          hint={`At least 20 characters. ${evidence.trim().length}/1500`}>
          {(p) => <textarea {...p} rows={5} maxLength={1500} value={evidence} onChange={(e) => setEvidence(e.target.value)} />}
        </Field>
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Submitting…' : 'Submit claim'}</button>
      </form>
    </section>
  );
}
