// One report: photos, details, the private section (owner and admins), owner actions and the claim box.
import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, CheckCircle2, ClipboardList, Lock, MapPin, Pencil, Tag, Warehouse } from 'lucide-react';
import { api } from '../../api';
import { useAuth } from '../../AuthContext';
import { formatDate, usePageTitle } from '../../components/ui';
import { Badge, Button, Card, Notice, Spinner, StatusBadge, TypeBadge, cx } from '../../design/primitives';
import { FormField } from '../../design/FormField';
import { ErrorSummary } from '../../design/forms';
import { Dialog } from '../../design/data';
import { categoryIcon } from '../../design/ItemCard';
import { validateClaim } from '../../validation';

const CUSTODY = {
  lost_property_office: 'At the lost-property office',
  with_finder: 'With the finder until it’s handed in',
  other: 'Held elsewhere on campus',
};

export default function ReportDetail() {
  const { id } = useParams();
  const { user, isAdmin } = useAuth();
  const location = useLocation();
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState(location.state?.flash || '');
  const [confirmClose, setConfirmClose] = useState(false);
  usePageTitle(report ? report.title : 'Item details');

  const load = useCallback(() => {
    setError('');
    return api.get(`/api/reports/${id}`).then((d) => setReport(d.report)).catch((e) => setError(e.message));
  }, [id]);
  useEffect(() => { load(); }, [load, user]);

  const closeReport = async () => {
    try { const d = await api.post(`/api/reports/${id}/close`); setFlash(d.message); setConfirmClose(false); load(); } catch (e) { setError(e.message); setConfirmClose(false); }
  };

  if (error && !report) {
    return <Page><Notice type="error" title="We couldn’t open this report.">{error}</Notice><BackLink /></Page>;
  }
  if (!report) return <Page><Spinner label="Loading item…" /></Page>;

  const privileged = report.isOwner || isAdmin;
  const found = report.type === 'found';
  return (
    <Page>
      <BackLink />
      {flash && <Notice type="success" onClose={() => setFlash('')}>{flash}</Notice>}
      {error && <Notice type="error">{error}</Notice>}
      {report.status === 'returned' && <Notice type="info">This item was returned to its owner{report.returnedAt ? ` on ${formatDate(report.returnedAt)}` : ''}.</Notice>}
      {report.status === 'awaiting_collection' && <Notice type="warning">A claim for this item has been approved and it is waiting to be collected. New claims aren’t being accepted.</Notice>}
      {report.status === 'closed' && <Notice type="info">The person who reported this has marked it as resolved.</Notice>}
      {report.status === 'removed' && <Notice type="error">This report has been removed from public listings by an administrator.</Notice>}

      <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        <Gallery report={report} privileged={privileged} />

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <TypeBadge type={report.type} /><StatusBadge status={report.status} />
              <span className="font-mono text-xs text-muted">{report.refCode}</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{report.title}</h1>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Detail icon={Tag} label="Category">{report.category}{report.categoryGroup && <span className="text-muted"> · {report.categoryGroup}</span>}</Detail>
            <Detail icon={CalendarDays} label={found ? 'Found on' : 'Lost on'}>{formatDate(report.eventDate)}</Detail>
            <Detail icon={MapPin} label="Where">{report.location}{report.locationDetail && <span className="block text-muted">{report.locationDetail}</span>}</Detail>
            {found && report.custody && <Detail icon={Warehouse} label="Where it is now">{CUSTODY[report.custody]}</Detail>}
          </dl>
          <div className="flex flex-col gap-1.5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Description</h2>
            <p className="whitespace-pre-line">{report.description}</p>
          </div>

          {privileged && found && (report.identifyingDetails || report.custodyNote) && (
            <section aria-labelledby="private-title" className="flex flex-col gap-2 rounded-card border-2 border-dashed border-ink/25 bg-white p-4">
              <h2 id="private-title" className="flex items-center gap-2 font-bold"><Lock aria-hidden="true" className="size-4" />Private: only {report.isOwner ? 'you' : 'the finder'} and the office see this</h2>
              {report.identifyingDetails && <p><span className="font-semibold">Identifying details: </span>{report.identifyingDetails}</p>}
              {report.custodyNote && <p><span className="font-semibold">Note for the office: </span>{report.custodyNote}</p>}
            </section>
          )}

          {report.isOwner && (
            <div className="flex flex-wrap gap-2">
              {report.canEdit && <Button to={`/reports/${report.id}/edit`} variant="secondary" icon={Pencil}>Edit report</Button>}
              {report.type === 'lost' && report.status === 'open' && (
                <Button variant="secondary" icon={CheckCircle2} onClick={() => setConfirmClose(true)}>I’ve got it back</Button>
              )}
            </div>
          )}
          {isAdmin && found && (
            <Button to={`/admin?tab=claims&report=${report.id}`} variant="subtle" icon={ClipboardList}>See claims for this item</Button>
          )}
        </div>
      </div>

      {found && !report.isOwner && !isAdmin && <ClaimBox report={report} user={user} onDone={(msg) => { setFlash(msg); load(); }} />}
      {!found && !report.isOwner && report.status === 'open' && !isAdmin && (
        <Card className="flex flex-col gap-2 p-5">
          <h2 className="text-lg font-bold">Have you found this?</h2>
          <p className="text-muted">Please don’t arrange a handover privately. Report it as found and take it to the lost-property office, so the owner can claim it safely.</p>
          <Button to="/reports/new?type=found" className="w-fit">Report it as found</Button>
        </Card>
      )}

      <Dialog open={confirmClose} title="Mark this as resolved?" onClose={() => setConfirmClose(false)}>
        <p className="text-muted">The listing will show that you’ve got your item back, and it won’t appear among open reports.</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmClose(false)}>Cancel</Button>
          <Button onClick={closeReport}>Yes, I’ve got it back</Button>
        </div>
      </Dialog>
    </Page>
  );
}

function Page({ children }) {
  return <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 md:py-8">{children}</div>;
}

function BackLink() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/items'))}
      className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-900">
      <ArrowLeft aria-hidden="true" className="size-4" />Back
    </button>
  );
}

function Detail({ icon: Icon, label, children }) {
  return (
    <div className="flex gap-2.5 rounded-control bg-mist/70 p-3">
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-700" />
      <div className="min-w-0"><dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt><dd className="mt-0.5">{children}</dd></div>
    </div>
  );
}

function Gallery({ report, privileged }) {
  const [current, setCurrent] = useState(0);
  const images = report.images || [];
  const Icon = categoryIcon(report.category);
  if (!images.length) {
    return (
      <div className="grid aspect-[4/3] place-items-center rounded-card border border-line bg-mist">
        <div className="flex flex-col items-center gap-2 text-muted"><Icon aria-hidden="true" className="size-14" strokeWidth={1.25} /><span className="text-sm">No photo</span></div>
      </div>
    );
  }
  const img = images[Math.min(current, images.length - 1)];
  return (
    <div className="flex flex-col gap-3">
      <figure className="relative overflow-hidden rounded-card border border-line bg-mist">
        <img src={img.url} alt={`${report.title}, photo ${current + 1} of ${images.length}`} className="aspect-[4/3] w-full object-contain" />
        {img.visibility === 'private' && (
          <figcaption className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded bg-ink/85 px-2 py-1 text-xs font-semibold text-white">
            <Lock aria-hidden="true" className="size-3.5" />Private photo: {privileged ? 'only the finder and the office can see it' : ''}
          </figcaption>
        )}
      </figure>
      {images.length > 1 && (
        <ul className="flex gap-2" aria-label="Photos">
          {images.map((im, i) => (
            <li key={im.id}>
              <button type="button" onClick={() => setCurrent(i)} aria-current={i === current ? 'true' : undefined}
                className={cx('relative block size-16 overflow-hidden rounded-control border-2', i === current ? 'border-brand-600' : 'border-transparent opacity-80 hover:opacity-100')}>
                <img src={im.url} alt="" className="size-full object-cover" />
                {im.visibility === 'private' && <Lock aria-hidden="true" className="absolute right-1 top-1 size-3.5 rounded bg-ink/80 p-0.5 text-white" />}
                <span className="sr-only">Show photo {i + 1}{im.visibility === 'private' ? ' (private)' : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ClaimBox({ report, user, onDone }) {
  const navigate = useNavigate();
  const [evidence, setEvidence] = useState('');
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  if (report.myClaim) {
    return (
      <Card className="flex flex-col gap-3 p-5">
        <h2 className="text-lg font-bold">Your claim</h2>
        <p className="flex flex-wrap items-center gap-2">Submitted on {formatDate(report.myClaim.createdAt)} · <StatusBadge status={report.myClaim.status} /></p>
        <Button to={`/my/claims/${report.myClaim.id}`} className="w-fit">See your claim and the office’s response</Button>
      </Card>
    );
  }
  if (report.status !== 'open') return null;
  if (!user) {
    return (
      <Card className="flex flex-col gap-3 p-5">
        <h2 className="text-lg font-bold">Is this yours?</h2>
        <p className="text-muted">Sign in with your registration number to make a private claim.</p>
        <Button className="w-fit" onClick={() => navigate('/login', { state: { from: `/reports/${report.id}` } })}>Sign in to claim</Button>
      </Card>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    const errs = validateClaim({ evidence });
    setErrors(errs); setMessage('');
    if (Object.keys(errs).length) return;
    setBusy(true);
    try { onDone((await api.post(`/api/reports/${report.id}/claims`, { evidence })).message); } catch (err) { setErrors(err.fields || {}); setMessage(err.message); } finally { setBusy(false); }
  };

  return (
    <Card as="section" aria-labelledby="claim-title" className="flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-1">
        <h2 id="claim-title" className="text-lg font-bold">Is this yours? Make a private claim</h2>
        <p className="text-muted">
          Describe something that is <strong>not</strong> in the public description or photos: an inscription, what’s inside, a scratch, the lock-screen picture.
          Only you and the lost-property office will read it.
        </p>
      </div>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <ErrorSummary errors={Object.keys(errors).length ? errors : null} message={message} />
        <FormField id="evidence" label="Why is this item yours?" required error={errors.evidence} hint={`At least 20 characters · ${evidence.trim().length}/1500`}>
          {(p) => <textarea {...p} rows={5} maxLength={1500} value={evidence} onChange={(e) => setEvidence(e.target.value)} />}
        </FormField>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit claim'}</Button>
          <Badge tone="neutral">Bring your student ID when you collect</Badge>
        </div>
      </form>
    </Card>
  );
}
