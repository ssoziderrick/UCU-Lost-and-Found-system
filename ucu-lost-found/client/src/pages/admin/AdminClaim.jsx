import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../AuthContext';
import { validateDecision } from '../../validation';
import { Alert, ErrorSummary, Field, Loading, StatusBadge, formatDate, usePageTitle } from '../../components/ui';

const DEFAULT_INSTRUCTIONS = 'Collect from the Lost & Found desk, Dean of Students office, Mon–Fri 9am–4pm. Bring your student ID.';

export default function AdminClaim() {
  const { id } = useParams();
  usePageTitle('Review claim');
  const { can } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const [mode, setMode] = useState(null); // 'approve' | 'reject' | 'revoke'
  const [form, setForm] = useState({ reason: '', collectionInstructions: DEFAULT_INSTRUCTIONS });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get(`/api/admin/claims/${id}`).then(setData).catch((e) => setError(e.message));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const decide = async (e) => {
    e.preventDefault();
    const errs = validateDecision(form, mode === 'approve');
    setErrors(errs); setError('');
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const body = mode === 'approve' ? form : { reason: form.reason };
      const d = await api.post(`/api/admin/claims/${id}/${mode}`, body);
      setFlash(d.message); setMode(null); setForm({ reason: '', collectionInstructions: DEFAULT_INSTRUCTIONS }); load();
    } catch (err) { setErrors(err.fields || {}); setError(err.message); } finally { setBusy(false); }
  };

  const confirmReturn = async () => {
    if (!window.confirm('Confirm that the claimant has collected this item? The listing will be marked as returned and any other pending claims will be closed.')) return;
    setBusy(true); setError('');
    try { const d = await api.post(`/api/admin/claims/${id}/confirm-return`); setFlash(d.message); load(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  if (error && !data) return <><Alert type="error">{error}</Alert><Link to="/admin">← Back to dashboard</Link></>;
  if (!data) return <Loading label="Loading claim…" />;
  const { claim: c, competing } = data;
  const otherApproved = competing.some((x) => ['approved', 'collected'].includes(x.status));

  return (
    <>
      <p className="crumbs"><Link to="/admin">← Back to dashboard</Link></p>
      <Alert type="success" onClose={() => setFlash('')}>{flash}</Alert>
      {mode === null && <Alert type="error">{error}</Alert>}
      <div className="page-head"><h1>Claim #{c.id}: {c.reportTitle}</h1><StatusBadge status={c.status} /></div>

      <div className="compare">
        <section className="card section" aria-labelledby="ev-title">
          <h2 id="ev-title" className="h3">Claimant's evidence</h2>
          <p className="meta">{c.claimantName} · {c.claimantRegistrationNumber || 'no registration no.'} · {c.claimantEmail}{c.claimantPhone ? ` · ${c.claimantPhone}` : ''}</p>
          <p className="meta">Submitted {formatDate(c.createdAt)}</p>
          <blockquote className="prewrap">{c.evidence}</blockquote>
        </section>
        <section className="card section private-box" aria-labelledby="pd-title">
          <h2 id="pd-title" className="h3">🔒 Finder's private identifying details</h2>
          <p className="meta">Found by {c.finderName} · {c.reportLocation} · {formatDate(c.reportDate)}</p>
          <blockquote className="prewrap">{c.reportPrivateDetails || 'No private details were recorded — ask the claimant to describe the item in person.'}</blockquote>
          <p className="meta"><strong>Public description:</strong> {c.reportDescription}</p>
          <p><Link to={`/reports/${c.reportId}`}>Open listing</Link> (item status: <StatusBadge status={c.reportStatus} />)</p>
        </section>
      </div>

      {competing.length > 0 && (
        <section className="card section">
          <h2 className="h3">Other claims on this item ({competing.length})</h2>
          <ul className="plain">
            {competing.map((x) => <li key={x.id}><Link to={`/admin/claims/${x.id}`}>Claim #{x.id}</Link> by {x.claimantName} · {formatDate(x.createdAt)} · <StatusBadge status={x.status} /></li>)}
          </ul>
        </section>
      )}

      {c.reviewedAt && (
        <section className="card section">
          <h2 className="h3">Decision record</h2>
          <p>{c.reviewedBy ? `By ${c.reviewedBy} on ` : ''}{formatDate(c.reviewedAt)}</p>
          {c.adminReason && <p><strong>Reason:</strong> {c.adminReason}</p>}
          {c.collectionInstructions && <p><strong>Collection instructions:</strong> {c.collectionInstructions}</p>}
          {c.collectedAt && <p><strong>Collected:</strong> {formatDate(c.collectedAt)}</p>}
        </section>
      )}

      <section className="card section" aria-labelledby="act-title">
        <h2 id="act-title" className="h3">Actions</h2>
        {!can('claims.decide') && ['pending', 'approved'].includes(c.status) && <p>Your role can read claims but not decide them.</p>}
        {c.status === 'pending' && can('claims.decide') && (
          <>
            {otherApproved && <Alert type="warning">Another claim on this item is already approved or collected, so this claim cannot be approved. You may reject it.</Alert>}
            <div className="btn-row">
              <button type="button" className="btn btn-success" disabled={otherApproved || c.reportStatus !== 'open'} onClick={() => { setMode('approve'); setErrors({}); }}>Approve for collection</button>
              <button type="button" className="btn btn-danger" onClick={() => { setMode('reject'); setErrors({}); }}>Reject claim</button>
            </div>
          </>
        )}
        {c.status === 'approved' && (
          <>
            <p>The claimant has been told where to collect the item. Only confirm the return once they have physically collected it and shown ID.</p>
            <div className="btn-row">
              {can('returns.confirm') && <button type="button" className="btn btn-success" disabled={busy} onClick={confirmReturn}>Confirm item collected</button>}
              {can('claims.decide') && <button type="button" className="btn btn-ghost" onClick={() => { setMode('revoke'); setErrors({}); }}>Cancel approval</button>}
            </div>
          </>
        )}
        {['rejected', 'collected'].includes(c.status) && <p>This claim is closed. No further action is needed.</p>}

        {mode && (
          <form onSubmit={decide} noValidate className="decision-form">
            <h3>{mode === 'approve' ? 'Approve claim' : mode === 'reject' ? 'Reject claim' : 'Cancel approval'}</h3>
            {Object.keys(errors).length ? <ErrorSummary errors={errors} /> : <Alert type="error">{error}</Alert>}
            <Field id="reason" label={mode === 'approve' ? 'Reason for approval' : 'Reason'} required error={errors.reason}
              hint={mode === 'approve' ? 'e.g. "Inscription described matches the finder\'s private details."' : 'The claimant will see this. Be clear and respectful.'}>
              {(p) => <textarea {...p} rows={3} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />}
            </Field>
            {mode === 'approve' && (
              <Field id="collectionInstructions" label="Collection instructions" required error={errors.collectionInstructions} hint="Where and when to collect, and what to bring.">
                {(p) => <input {...p} maxLength={255} value={form.collectionInstructions} onChange={(e) => setForm((f) => ({ ...f, collectionInstructions: e.target.value }))} />}
              </Field>
            )}
            <div className="btn-row">
              <button type="submit" className={`btn ${mode === 'approve' ? 'btn-success' : 'btn-danger'}`} disabled={busy}>{busy ? 'Saving…' : 'Record decision'}</button>
              <button type="button" className="btn btn-ghost" onClick={() => setMode(null)}>Cancel</button>
            </div>
          </form>
        )}
      </section>
    </>
  );
}
